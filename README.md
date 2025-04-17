# HEP to InfluxDB Line Protocol Converter

This project provides tools to convert HEP packets into GigAPI Line Protocol.

## Features

- Converts HEP packets to GigAPI/InfluxDB Line Protocol
- Maintains the same column structure and table as hep
- Parses SIP payload data to extract useful fields
- Can be used as a library or as a standalone server
- Supports both TCP and UDP for HEP packet reception
- Batch processing for efficient InfluxDB writes
- Optional file output for debugging or offline processing

## Components

1. **HepToLineProtocolConverter**: Core library for converting HEP packets to Line Protocol
2. **Usage Example**: Simple example demonstrating how to use the converter
3. **HEP to InfluxDB Server**: Complete server implementation that receives HEP packets and forwards them to InfluxDB

## Installation

```bash
# Install dependencies
npm install @duckdb/node-api hep-js parsip axios
# or with Bun
bun install @duckdb/node-api hep-js parsip axios
```

## Usage

### Basic Conversion

```javascript
import HepToLineProtocolConverter from './hep-proto.js';
import hepjs from 'hep-js';

// Create an instance of the converter
const converter = new HepToLineProtocolConverter();

// Create a test HEP packet
const rcinfo = {
  type: 'HEP',
  version: 3,
  payload_type: 1, // SIP
  captureId: 2001,
  srcIp: '192.168.1.1',
  dstIp: '192.168.1.2',
  srcPort: 5060,
  dstPort: 5060,
  timeSeconds: Math.floor(Date.now() / 1000),
  timeUseconds: (Date.now() % 1000) * 1000,
  protocolType: 1 // UDP
};

const payload = 'INVITE sip:alice@example.com SIP/2.0\r\n...';
const packet = hepjs.encapsulate(payload, rcinfo);

// Convert to Line Protocol
const lineProtocol = converter.convertPacket(packet);
console.log(lineProtocol);
```

### Using the Server

```javascript
import HepToInfluxDBServer from './hep-server.js';

// Create and start the server with custom configuration
const server = new HepToInfluxDBServer({
  hepPort: 9060,
  influxDbUrl: 'http://localhost:8086',
  influxDbDatabase: 'hep',
  batchSize: 1000,
  flushInterval: 5000,
  debug: true
});

server.initialize().catch(console.error);
```

## Configuration Options

### HepToInfluxDBServer

| Option | Description | Default |
|--------|-------------|---------|
| hepPort | Port to listen for HEP packets | 9060 |
| hepBindAddress | Address to bind HEP server | 0.0.0.0 |
| influxDbUrl | InfluxDB server URL | http://localhost:8086 |
| influxDbDatabase | InfluxDB database name | hep |
| batchSize | Number of records to batch before sending | 1000 |
| flushInterval | Maximum time between flushes (ms) | 5000 |
| maxBufferSize | Maximum buffer size before forced flush | 10000 |
| debug | Enable debug logging | false |
| writeToFile | Save Line Protocol to files | false |
| outputDir | Directory for output files | ./data |

## Output Format

The converter creates InfluxDB Line Protocol data with the following structure:

```
hep_1,src_ip=192.168.1.1,dst_ip=192.168.1.2,src_port=5060,dst_port=5060 create_date=1618426800000i,sip_method="INVITE",call_id="a84b4c76e66710@example.com",payload_size=245i 1618426800000000000
```

Where:
- `hep_1` is the measurement name (derived from HEP payload type)
- Tags include network information like `src_ip`, `dst_ip`, `src_port`, `dst_port`
- Fields include the packet data, timestamp information, and parsed SIP headers

## Line Protocol Structure

### Measurements

Measurements are named based on the HEP payload type:
- `hep_1`: SIP packets
- `hep_5`: RTCP packets
- `hep_34`: RTPAgent packets
- etc.

### Tags

Tags are extracted from the HEP protocol header and include:
- `capture_id`
- `src_ip`, `dst_ip`
- `src_port`, `dst_port`
- `ip_protocol_id`
- `ip_protocol_family`
- `protocol_type`
- `vlan`
- `vendor_module`

### Fields

Fields include:
- `create_date`: Timestamp in milliseconds
- `time_sec`, `time_usec`: Original timestamp components
- `payload`: Raw packet payload
- `payload_size`: Size of the payload in bytes

For SIP packets (type 1), additional fields are extracted:
- `sip_method`: SIP method (INVITE, BYE, etc.)
- `sip_status
