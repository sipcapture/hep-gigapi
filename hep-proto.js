/**
 * HEP to InfluxDB Line Protocol Converter
 * 
 * This module converts Homer Encapsulation Protocol (HEP) packets into InfluxDB Line Protocol format.
 * It maintains the same column structure and table naming conventions as seen in the provided HEP ingestor code.
 */

import hepjs from 'hep-js';
import { getSIP } from 'parsip';

class HepToLineProtocolConverter {
  constructor() {
    this.debug = false;
    // Default SIP headers to extract
    this.sipHeaders = [
      'Call-ID',
      'From',
      'To',
      'CSeq',
      'User-Agent',
    ];
    // Whether to include parsed values in addition to raw values
    this.includeParsedValues = false;
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enable - Whether to enable debug mode
   */
  setDebug(enable) {
    this.debug = !!enable;
  }

  /**
   * Set which SIP headers should be extracted
   * @param {Array<string>} headers - Array of SIP header names to extract
   */
  setSipHeaders(headers) {
    if (!Array.isArray(headers)) {
      throw new Error('SIP headers must be provided as an array');
    }
    this.sipHeaders = headers.map(h => h.toLowerCase());
  }

  /**
   * Set whether to include parsed values in addition to raw values
   * @param {boolean} include - Whether to include parsed values
   */
  setIncludeParsedValues(include) {
    this.includeParsedValues = !!include;
  }

  /**
   * Process a single HEP packet and convert it to Line Protocol format
   * @param {Buffer} data - Raw HEP packet data
   * @returns {string} Line Protocol formatted data
   */
  convertPacket(data) {
    try {
      // Decode the HEP packet
      const decoded = hepjs.decapsulate(data);
      // Extract the HEP data
      const hepData = {
        protocol_header: decoded.rcinfo,
        create_date: this.getHepTimestamp(decoded.rcinfo),
        raw: decoded.payload || "",
        // HEP proto_type is decoded as payloadType by hep-js
        type: decoded.rcinfo.payloadType || 0
      };
      
      // Convert to Line Protocol
      return this.createLineProtocol(hepData);
    } catch (error) {
      if (this.debug) console.error('Error converting HEP packet:', error);
      throw error;
    }
  }

  /**
   * Convert multiple HEP packets to Line Protocol format
   * @param {Array<Buffer>} packets - Array of raw HEP packet data
   * @returns {string} Line Protocol formatted data (multiple lines)
   */
  convertPackets(packets) {
    try {
      return packets
        .map(packet => this.convertPacket(packet))
        .filter(line => line) // Remove any empty lines
        .join('\n');
    } catch (error) {
      if (this.debug) console.error('Error converting HEP packets:', error);
      throw error;
    }
  }

  /**
   * Create InfluxDB Line Protocol string from HEP data
   * @param {Object} hepData - Processed HEP data
   * @returns {string} Line Protocol formatted string
   */
  createLineProtocol(hepData) {
    try {
      const { protocol_header, create_date, raw, type } = hepData;
      
      // Measurement name based on the payload type
      const measurement = `hep_${type}`;
      
      // Extract timestamp in nanoseconds for InfluxDB
      const timestamp = Math.floor(create_date.getTime() * 1000000); // Convert milliseconds to nanoseconds
      
      // Process tags from protocol_header
      const tags = this.extractTags(protocol_header);
      
      // Process fields from protocol_header and raw payload
      const fields = this.extractFields(protocol_header, raw, type);
      
      // Construct the line protocol string
      // Format: <measurement>,<tag_set> <field_set> <timestamp>
      // Make sure there are at least some tags to avoid syntax errors
      if (Object.keys(tags).length === 0) {
        // Add a default tag if none exist
        tags.source = 'hep';
      }
      
      const tagString = Object.entries(tags)
        .map(([key, value]) => `${this.escapeKey(key)}=${this.escapeTagValue(value)}`)
        .join(',');
      
      const fieldString = Object.entries(fields)
        .map(([key, value]) => {
          // Handle different field types
          if (typeof value === 'string') {
            return `${this.escapeKey(key)}="${this.escapeFieldValue(value)}"`;
          } else if (typeof value === 'number') {
            // Use integer notation for integers, float notation for floats
            return `${this.escapeKey(key)}=${Number.isInteger(value) ? `${value}i` : value}`;
          } else if (typeof value === 'boolean') {
            return `${this.escapeKey(key)}=${value}`;
          } else if (value === null || value === undefined) {
            return null; // Skip null/undefined values
          } else {
            // Convert objects to JSON strings
            return `${this.escapeKey(key)}="${this.escapeFieldValue(JSON.stringify(value))}"`;
          }
        })
        .filter(Boolean) // Remove nulls
        .join(',');
      
      // Construct the final line
      return `${measurement},${tagString} ${fieldString} ${timestamp}`;
    } catch (error) {
      if (this.debug) console.error('Error creating Line Protocol:', error);
      return ''; // Return empty string on error
    }
  }

  /**
   * Extract tags from HEP protocol header
   * @param {Object} header - HEP protocol header
   * @returns {Object} Tag key-value pairs
   */
  extractTags(header) {
    const tags = {};
    
    // Extract common tags from protocol header
    if (header.captureId) tags.capture_id = header.captureId;
    if (header.capturePass) tags.capture_pass = header.capturePass;
    if (header.srcIp) tags.src_ip = header.srcIp;
    if (header.dstIp) tags.dst_ip = header.dstIp;
    if (header.srcPort) tags.src_port = header.srcPort;
    if (header.dstPort) tags.dst_port = header.dstPort;
    if (header.ipProtocolId) tags.ip_protocol_id = header.ipProtocolId;
    if (header.ipProtocolFamily) tags.ip_protocol_family = header.ipProtocolFamily;
    if (header.protocolType) tags.protocol_type = header.protocolType;
    
    // Handle vendor-specific data if present
    if (header.vlan && header.vlan.toString) tags.vlan = header.vlan.toString();
    if (header.vendor_module) tags.vendor_module = header.vendor_module;
    
    return tags;
  }

  /**
   * Extract user part from a SIP URI
   * @param {string} uri - The SIP URI to parse
   * @returns {string} The user part of the URI
   */
  extractUserFromUri(uri) {
    try {
      // Remove any angle brackets and extract the URI part
      const cleanUri = uri.replace(/[<>]/g, '');
      // Extract the user part before the @ symbol
      const match = cleanUri.match(/^sip:([^@]+)@/);
      return match ? match[1] : cleanUri;
    } catch (e) {
      if (this.debug) console.error('Error extracting user from URI:', e);
      return uri;
    }
  }

  /**
   * Extract fields from HEP protocol header and payload
   * @param {Object} header - HEP protocol header
   * @param {string} payload - Raw packet payload
   * @param {number} type - HEP payload type
   * @returns {Object} Field key-value pairs
   */
  extractFields(header, payload, type) {
    const fields = {
      create_date: this.getHepTimestamp(header).getTime(),
      time_sec: parseInt(header.timeSeconds, 10),
      time_usec: parseInt(header.timeUseconds, 10)
    };
    
    if (payload) {
      fields.payload = payload.replace(/\r\n|\n|\r/g, '\\r\\n');
      fields.payload_size = payload.length;
    }

    // Fast path for non-SIP packets
    if (type !== 1) return fields;

    // SIP-specific extraction
    try {
      const sipData = getSIP(payload);
      if (!sipData || !sipData.headers) return fields;

      // Extract method/status and set the method field
      if (sipData.method) {
        fields.sip_method = String(sipData.method);
        fields.method = String(sipData.method);
      } else if (sipData.status) {
        fields.sip_status = parseInt(sipData.status, 10);
        fields.method = String(sipData.status);
      }

      // Process only configured headers
      for (const headerName of this.sipHeaders) {
        const headerValue = sipData.headers[headerName];
        if (!headerValue) continue;

        // Handle both raw and parsed values
        if (typeof headerValue === 'object' && headerValue.raw !== undefined) {
          const rawValue = String(headerValue.raw).trim();
          
          // Special handling for From and To headers
          if (headerName.toLowerCase() === 'from' || headerName.toLowerCase() === 'to') {
            fields[`${headerName.toLowerCase()}_user`] = this.extractUserFromUri(rawValue);
          }
          
          fields[`sip_${headerName.toLowerCase()}`] = rawValue;
          
          // Optionally include parsed value if configured
          if (this.includeParsedValues && headerValue.parsed) {
            fields[`sip_${headerName.toLowerCase()}_parsed`] = JSON.stringify(headerValue.parsed);
          }
        } else {
          // Handle direct string values
          const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
          const stringValue = String(value.raw).trim();
          // Special handling for From and To headers
          if (headerName.toLowerCase() === 'from' || headerName.toLowerCase() === 'to') {
            fields[`${headerName.toLowerCase()}_user`] = this.extractUserFromUri(stringValue);
          }
          
          fields[`sip_${headerName.toLowerCase()}`] = stringValue;
        }
      }
    } catch (e) {
      if (this.debug) console.error('Error parsing SIP payload:', e);
    }
    
    return fields;
  }

  /**
   * Get timestamp from HEP protocol header
   * @param {Object} rcinfo - HEP protocol header
   * @returns {Date} Timestamp as a Date object
   */
  getHepTimestamp(rcinfo) {
    if (!rcinfo.timeSeconds) return new Date();
    return new Date(
      (rcinfo.timeSeconds * 1000) + 
      (((100000 + rcinfo.timeUseconds) / 1000) - 100)
    );
  }

  /**
   * Escape special characters in line protocol key names
   * @param {string} key - Key name to escape
   * @returns {string} Escaped key name
   */
  escapeKey(key) {
    if (typeof key !== 'string') return key;
    return key.replace(/[ ,=]/g, '\\$&');
  }

  /**
   * Escape special characters in tag values
   * @param {string} value - Tag value to escape
   * @returns {string} Escaped tag value
   */
  escapeTagValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[ ,=]/g, '\\$&');
  }

  /**
   * Escape special characters in field values
   * @param {string} value - Field value to escape
   * @returns {string} Escaped field value
   */
  escapeFieldValue(value) {
    if (value === null || value === undefined) return '';
    // Replace newlines with \r\n and escape quotes and backslashes
    return String(value)
      .replace(/\r\n|\n|\r/g, '\\r\\n')
      .replace(/["\\]/g, '\\$&');
  }
}

// Function to create a new converter
export function createHepToLineProtocolConverter() {
  return new HepToLineProtocolConverter();
}

// Export the converter class
export default HepToLineProtocolConverter;
