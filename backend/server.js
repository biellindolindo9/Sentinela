const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cors());

const FRONTEND_DIR = path.join(__dirname, "../frontend");
const DB_FILE = path.join(__dirname, "db.json");

app.use(express.static(FRONTEND_DIR));

function bancoInicial() {
  return {
    usuarios: [
      {
        id: 1,
        usuario: "triagem",
        senha: "123",
        nome: "Equipe de Triagem",
        tipo: "triagem"
      },
      {
        id: 2,
        usuario: "medico",
        senha: "123",
        nome: "Equipe Médica",
        tipo: "medico"
      },
      {
        id: 3,
        usuario: "atendimento",
        senha: "123",
        nome: "Recepção",
        tipo: "atendimento"
      }
    ],
    pacientes: [],
    triagens: [],
    consultas: [],
    tv_chamada: null,
    tv_historico: []
  };
}

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const inicial = bancoInicial();
      writeDB(inicial);
      return inicial;
    }

    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    db.usuarios = db.usuarios || [];
    db.pacientes = db.pacientes || [];
    db.triagens = db.triagens || [];
    db.consultas = db.consultas || [];
    db.tv_chamada = db.tv_chamada || null;
    db.tv_historico = db.tv_historico || [];

    return db;
  } catch (erro) {
    console.error("Erro ao ler banco:", erro);
    throw erro;
  }
}

function writeDB(data) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function agora() {
  return new Date().toISOString();
}

function gerarSenhaPaciente() {
  const numero = Math.floor(100 + Math.random() * 900);
  return `P${numero}`;
}

/* =========================================================
   LOGIN
========================================================= */

app.post("/login", (req, res) => {
  const db = readDB();

  const usuario = String(req.body.usuario || "").trim();
  const senha = String(req.body.senha || "").trim();

  const user = db.usuarios.find(
    u => u.usuario === usuario && u.senha === senha
  );

  if (!user) {
    return res.status(401).json({
      erro: "Usuário ou senha inválidos"
    });
  }

  res.json({
    id: user.id,
    usuario: user.usuario,
    nome: user.nome,
    tipo: user.tipo
  });
});

/* =========================================================
   ATENDIMENTO
========================================================= */

app.post("/atendimento", (req, res) => {
  const db = readDB();

  const nome = String(req.body.nome || "").trim();
  const cpf = String(req.body.cpf || "").trim();
  const tipo = String(req.body.tipo || "normal").trim();

  if (!nome) {
    return res.status(400).json({
      erro: "Nome do paciente é obrigatório"
    });
  }

  const paciente = {
    id: Date.now(),
    senha: gerarSenhaPaciente(),
    nome,
    cpf,
    tipo,
    status: "aguardando_triagem",
    createdAt: agora()
  };

  db.pacientes.push(paciente);

  writeDB(db);

  res.json(paciente);
});

app.get("/pacientes", (req, res) => {
  const db = readDB();

  res.json(
    db.pacientes.sort(
      (a, b) =>
        new Date(a.createdAt) - new Date(b.createdAt)
    )
  );
});

/* =========================================================
   TRIAGEM
========================================================= */

app.post("/triagem", (req, res) => {
  const db = readDB();

  const pacienteId = Number(req.body.pacienteId);

  const paciente = db.pacientes.find(
    p => p.id === pacienteId
  );

  if (!paciente) {
    return res.status(404).json({
      erro: "Paciente não encontrado"
    });
  }

  let risco = String(req.body.risco || "").toLowerCase();

  const temperatura = Number(req.body.temperatura);

  if (temperatura >= 39) {
    risco = "vermelho";
  } else if (temperatura >= 38 && risco !== "vermelho") {
    risco = "amarelo";
  } else if (!risco) {
    risco = "verde";
  }

  const triagemExistente = db.triagens.find(
    t =>
      t.pacienteId === pacienteId &&
      t.status !== "finalizada"
  );

  if (triagemExistente) {
    return res.status(409).json({
      erro: "Este paciente já possui uma triagem em andamento"
    });
  }

  const triagem = {
    id: Date.now(),
    pacienteId,
    nome: paciente.nome,
    cpf: paciente.cpf,
    senha: paciente.senha,
    sintoma: req.body.sintoma || "",
    temperatura: temperatura || null,
    pressao: req.body.pressao || "",
    saturacao: req.body.saturacao || "",
    frequencia: req.body.frequencia || "",
    alergia: req.body.alergia || "",
    observacao: req.body.observacao || "",
    risco,
    status: "aguardando_medico",
    createdAt: agora()
  };

  db.triagens.push(triagem);

  paciente.status = "aguardando_medico";
  paciente.risco = risco;
  paciente.triagemId = triagem.id;

  writeDB(db);

  res.json(triagem);
});

app.get("/triagens", (req, res) => {
  const db = readDB();

  res.json(
    db.triagens
      .filter(t => t.status !== "finalizada")
      .sort((a, b) => {
        const prioridade = {
          vermelho: 1,
          amarelo: 2,
          verde: 3
        };

        const riscoA = prioridade[a.risco] || 4;
        const riscoB = prioridade[b.risco] || 4;

        if (riscoA !== riscoB) {
          return riscoA - riscoB;
        }

        return (
          new Date(a.createdAt) -
          new Date(b.createdAt)
        );
      })
  );
});

/* =========================================================
   CHAMADA DA TV
========================================================= */

app.post("/tv/chamar", (req, res) => {
  const db = readDB();

  const chamada = {
    id: Date.now().toString(),
    localTipo: req.body.localTipo || "Consultório",
    localNumero: req.body.localNumero || "01",
    paciente: req.body.paciente || "Paciente",
    senha: req.body.senha || "",
    risco: req.body.risco || "",
    hora: new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };

  db.tv_chamada = chamada;

  db.tv_historico.unshift(chamada);

  if (db.tv_historico.length > 6) {
    db.tv_historico.pop();
  }

  writeDB(db);

  res.json(chamada);
});

app.get("/tv/chamada", (req, res) => {
  const db = readDB();

  res.json({
    chamada: db.tv_chamada,
    historico: db.tv_historico
  });
});

/* =========================================================
   CONSULTA MÉDICA
========================================================= */

app.post("/consulta", (req, res) => {
  const db = readDB();

  const pacienteId = Number(req.body.pacienteId);

  const paciente = db.pacientes.find(
    p => p.id === pacienteId
  );

  const triagem = db.triagens.find(
    t => t.pacienteId === pacienteId &&
         t.status === "aguardando_medico"
  );

  if (!paciente) {
    return res.status(404).json({
      erro: "Paciente não encontrado"
    });
  }

  const consulta = {
    id: Date.now(),
    pacienteId,
    paciente: paciente.nome,
    senha: paciente.senha,
    diagnostico: req.body.diagnostico || "",
    medicacao: req.body.medicacao || "",
    obs: req.body.obs || "",
    createdAt: agora()
  };

  db.consultas.push(consulta);

  paciente.status = "finalizado";
  paciente.consultaId = consulta.id;

  if (triagem) {
    triagem.status = "finalizada";
  }

  writeDB(db);

  res.json(consulta);
});

app.get("/consultas", (req, res) => {
  const db = readDB();

  res.json(
    db.consultas.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    )
  );
});

/* =========================================================
   MEDICAÇÕES
========================================================= */

app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

app.get("/medicacoes", (req, res) => {
  const db = readDB();

  res.json(db.consultas);
});

/* =========================================================
   PÁGINA INICIAL
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(FRONTEND_DIR, "index.html")
  );
});

/* =========================================================
   START
========================================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sentinela Hospitalar rodando na porta ${PORT}`);
  console.log(`Banco: ${DB_FILE}`);
});
