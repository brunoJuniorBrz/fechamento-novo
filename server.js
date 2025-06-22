const { createServer } = require('https-localhost');
const next = require('next');

const port = 5000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, () => {
    console.log('> Servidor rodando em https://localhost:' + port);
  });
}); 