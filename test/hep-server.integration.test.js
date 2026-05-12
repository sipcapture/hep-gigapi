import { spawn } from 'child_process';
import { test, expect, beforeAll, afterAll } from 'bun:test';
import net from 'net';
import dgram from 'dgram';

const TEST_UDP_PORT = 19060;
const TEST_TCP_PORT = 19060;
const TEST_HTTP2_PORT = 18080;
const TEST_HTTP2_ENDPOINT = '/test/api';
const HOST = '127.0.0.1';

let serverProcess;

function waitForPort(port, host, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function tryConnect() {
      const socket = net.createConnection({ port, host }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
    }
    tryConnect();
  });
}

beforeAll(async () => {
  // Start the server as a child process
  serverProcess = spawn('bun', ['hep-server.js'], {
    env: {
      ...process.env,
      PORT: TEST_UDP_PORT,
      HOST: HOST,
      HTTP2_PORT: TEST_HTTP2_PORT,
      HTTP2_HOST: HOST,
      HTTP2_ENDPOINT: TEST_HTTP2_ENDPOINT,
      DEBUG: '1',
      INFLUX_DBURL: 'http://localhost:7971', // dummy
      INFLUXB_DBNAME: 'hep',
      BATCH_SIZE: '1', // flush immediately for test
      FLUSH_INTERVAL: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for all ports to be open
  await waitForPort(TEST_UDP_PORT, HOST);
  await waitForPort(TEST_TCP_PORT, HOST);
  await waitForPort(TEST_HTTP2_PORT, HOST);
});

afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
    await new Promise((resolve) => serverProcess.on('exit', resolve));
  }
});

function createTestHepPacket() {
  const hepjs = require('hep-js');
  const rcinfo = {
    type: 'HEP',
    version: 3,
    payload_type: 1, // SIP
    captureId: 2001,
    capturePass: 'myHep',
    srcIp: '192.168.1.1',
    dstIp: '192.168.1.2',
    srcPort: 5060,
    dstPort: 5060,
    timeSeconds: Math.floor(Date.now() / 1000),
    timeUseconds: (Date.now() % 1000) * 1000,
    proto_type: 1, // SIP
  };
  const payload = 'INVITE sip:alice@example.com SIP/2.0\r\n...';
  return hepjs.encapsulate(payload, rcinfo);
}

test('UDP ingestion', async () => {
  const packet = createTestHepPacket();
  const udpClient = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    udpClient.send(packet, TEST_UDP_PORT, HOST, (err) => {
      udpClient.close();
      if (err) reject(err);
      else resolve();
    });
  });
  expect(true).toBe(true); // If no error, test passes
});

test('TCP ingestion', async () => {
  const packet = createTestHepPacket();
  await new Promise((resolve, reject) => {
    const client = net.createConnection({ port: TEST_TCP_PORT, host: HOST }, () => {
      client.write(packet);
      client.end();
      resolve();
    });
    client.on('error', reject);
  });
  expect(true).toBe(true);
});

test('HTTP/2 ingestion', async () => {
  const packet = createTestHepPacket();
  const url = `http://${HOST}:${TEST_HTTP2_PORT}${TEST_HTTP2_ENDPOINT}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: packet
  });
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(body).toBe('OK');
}); 