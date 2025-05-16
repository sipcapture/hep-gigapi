<img src="https://github.com/user-attachments/assets/ddd8d553-3740-4a98-b365-76c0b971d031" width=200 />

# HEP ➡️ GigAPI Relay

This project provides tools to convert HEP packets into GigAPI Line Protocol.

> [!WARNING]
> This is a demo tool. Native HEPv3 support is expected in GigAPI

## Features

- Converts HEP packets to GigAPI/InfluxDB Line Protocol
- Maintains the same column structure and table as hep
- Parses SIP payload data to extract useful fields
- Can be used as a library or as a standalone server
- Supports both TCP and UDP for HEP packet reception
- Batch processing for efficient InfluxDB writes
- Optional file output for debugging or offline processing

## Components

1. **hep-proto**: Core library for converting HEP packets to Line Protocol
2. **hep-server**: Complete HEP:GigAPI relay server implementation
3. **example**: Simple example demonstrating how to use the converter


## Usage

<img src="https://github.com/user-attachments/assets/1f206cea-2a4c-426c-9400-c4223fdd8f30" width=800 />


### Gigapi + Homer Bundle
```yaml
services:
  gigapi:
    image: ghcr.io/gigapi/gigapi:latest
    container_name: gigapi
    hostname: gigapi
    restart: unless-stopped
    volumes:
      - ./data:/data
    ports:
      - "7971:7971"
    environment:
      - GIGAPI_ENABLED=true
      - GIGAPI_MERGE_TIMEOUT_S=10
      - GIGAPI_ROOT=/data
      - PORT=7971
  hep-gigapi:
    image: ghcr.io/sipcapture/hep-gigapi:latest
    container_name: hep-gigapi
    hostname: hep-gigapi
    ports:
      - "9060:9060/udp"
      - "9060:9060/tcp"
    environment:
      - PORT=9060
      - INFLUX_DBURL=http://gigapi:7971
```
### GigAPI Query
```bash
curl -X POST "http://gigapi:7971/query?db=hep" \
     -H "Content-Type: application/json"  \
     -d '{"query": "SELECT * FROM hep_1"}'

{"results":[{"__timestamp":"1744905216588281769","capture_id":"2001","capture_pass":"myHep","create_date":"1744905210441","date":"2025-04-17T00:00:00Z","dst_ip":"192.168.1.2","dst_port":"5060","hour":"15","payload":"INVITE sip:alice@example.com SIP/2.0\\r\\nVia: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK776asdhds\\r\\nFrom: Bob \u003csip:bob@example.com\u003e;tag=1928301774\\r\\nTo: Alice \u003csip:alice@example.com\u003e\\r\\nCall-ID: a84b4c76e66710@example.com\\r\\nCSeq: 314159 INVITE\\r\\nContact: \u003csip:bob@192.168.1.1:5060\u003e\\r\\nContent-Type: application/sdp\\r\\nContent-Length: 0\\r\\n\\r\\n","payload_size":"327","src_ip":"192.168.1.1","src_port":"5060","time":"1744905210441000000","time_sec":"1744905210","time_usec":"441000"},{"__timestamp":"1744905216588281850","capture_id":"2001","capture_pass":"myHep","create_date":"1744905210442","date":"2025-04-17T00:00:00Z","dst_ip":"192.168.1.2","dst_port":"5060","hour":"15","payload":"INVITE sip:alice@example.com SIP/2.0\\r\\nVia: SIP/2.0/UDP 192.168.1.1:5060;branch=z9hG4bK776asdhds\\r\\nFrom: Bob \u003csip:bob@example.com\u003e;tag=1928301774\\r\\nTo: Alice \u003csip:alice@example.com\u003e\\r\\nCall-ID: a84b4c76e66710@example.com\\r\\nCSeq: 314159 INVITE\\r\\nContact: \u003csip:bob@192.168.1.1:5060\u003e\\r\\nContent-Type: application/sdp\\r\\nContent-Length: 0\\r\\n\\r\\n","payload_size":"327","src_ip":"192.168.1.1","src_port":"5060","time":"1744905210442000000","time_sec":"1744905210","time_usec":"442000"}]}
```

<br>

## Installation

```bash
# Install dependencies
npm install @duckdb/node-api hep-js parsip axios
# or with Bun
bun install @duckdb/node-api hep-js parsip axios
```

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
  influxDbUrl: 'http://localhost:7971',
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
| influxDbUrl | InfluxDB server URL | http://localhost:7971 |
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

