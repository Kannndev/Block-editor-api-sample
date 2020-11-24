const express = require('express');
const app = express();
const port = 3000;
const WebSocket = require('ws');
const url = require('url');
const qs = require('querystring');
const bodyParser = require('body-parser');
var cors = require('cors');

app.use(bodyParser.json());
app.use(cors());

const docs = [
  {
    id: '1',
    docName: 'FF Test',
    blocks: [
      {
        id: 1,
        blockType: 'Text',
        position: 1,
      },
    ],
    createdAt: 10,
    updatedAt: 11,
  },
];

const textBlocks = {
  1: {
    id: 1,
    content: '',
  },
};

app.get('/', (req, res) => {
  console.log('Hello');
  res.status(200).send('Hello World!');
});

app.get('/document/:id', (req, res) => {
  res.send({
    ...docs[0],
    blocks: [{ ...docs[0].blocks[0], ...textBlocks[1] }],
  });
});

app.get('/block/:id', (req, res) => {
  const id = req.params.id;
  res.send(textBlocks[id]);
});

app.put('/block/:id', (req, res) => {
  const block = textBlocks[req.params.id];
  block.content = req.body.content;
  res.send(block);
});

const wsSessions = {};
const wsConnections = {};

app.listen(port, () => {
  console.log(`listening on ${port}`);
  try {
    const wss = new WebSocket.Server({ port: 8080 });

    wss.on('connection', function connection(ws, req) {
      ws.id = Math.floor(Math.random() * 10000);
      ws.isAlive = true;

      const query = url.parse(req.url).query;
      const queryParams = qs.parse(query);

      ws.docId = queryParams.id;
      wsSessions[ws.id] = ws;

      if (wsConnections[ws.docId]) {
        wsConnections[ws.docId].push({ id: ws.id });
      } else {
        wsConnections[ws.docId] = [{ id: ws.id }];
      }

      onMessage(ws);
      onHealthResponse(ws);
      onClose(ws);
      onError(ws);
    });

    healthCheck(wss);
  } catch (err) {
    console.log(err);
  }
});

const onMessage = (ws) => {
  ws.on('message', (data) => {
    data = JSON.parse(data);
    console.log(JSON.stringify(data));
    notifyConnections(ws.docId, data, ws.id);
  });
};

const healthCheck = (wss) => {
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        cleanUpConnection(ws.id, ws.docId);
        return;
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 60000);
};

const onHealthResponse = (ws) => {
  ws.on('pong', () => {
    ws.isAlive = true;
  });
};

const onClose = (ws) => {
  ws.on('close', (code, reason) => {
    console.log(`Client connection closed (Code: ${code}, Reason: ${reason}`);
    ws.isAlive = false;

    cleanUpConnection(ws.id, ws.docId);
    delete wsSessions[ws.id];
    // notifyConnections(ws.docId, ws.id);
  });
};

const onError = (ws) => {
  ws.on('error', (error) => {
    console.error(error);
    ws.isAlive = false;

    cleanUpConnection(ws.id, ws.docId);
    console.log(`Errored connection docId = ${ws.docId}, id = ${ws.id}`);
  });
};

const cleanUpConnection = (id, docId) => {
  const connectionIndex = wsConnections[docId]?.findIndex(
    (con) => con.id === id
  );
  if (connectionIndex !== undefined && connectionIndex !== -1) {
    wsConnections[docId].splice(connectionIndex, 1);
  }
  delete wsSessions[id];
};

const notifyConnections = (docId, data, currentSocketId) => {
  wsConnections[docId]?.forEach((con) => {
    if (wsSessions[con.id]?.isAlive && con.id !== currentSocketId) {
      wsSessions[con.id]?.send(
        JSON.stringify({
          docId,
          data,
        })
      );
    }
  });
};
