const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, 'frontend-react', 'src', 'pages', 'InterviewEdit.jsx');
let code = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Remove apenas a tag <input ... placeholder="CPF (opcional)" ... /> sem cruzar para outras tags
const regexInputUnico = /<input\b(?:(?!<input\b)[\s\S])*?placeholder=["']CPF \(opcional\)["'][\s\S]*?\/>\s*/g;
const novoCode = code.replace(regexInputUnico, '');

if (novoCode === code) {
  throw new Error('Não foi possível localizar o <input placeholder="CPF (opcional)" /> isolado.');
}

fs.writeFileSync(p, novoCode, 'utf8');
console.log('-> InterviewEdit.jsx: apenas o campo "CPF (opcional)" foi removido com segurança.');
