const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissoes (
      id          SERIAL PRIMARY KEY,
      tipo        TEXT NOT NULL,
      nome        TEXT NOT NULL,
      turma       TEXT,
      area        TEXT NOT NULL,
      nivel       INTEGER NOT NULL,
      programacao TEXT NOT NULL,
      linguagens  TEXT,
      mulher      TEXT,
      comentario  TEXT,
      criado_em   TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✔ Schema ready');
}

// ── Routes ──────────────────────────────────────────────────────────

// POST /api/submissoes
app.post('/api/submissoes', async (req, res) => {
  const { tipo, nome, turma, area, nivel, programacao, linguagens, mulher, comentario } = req.body;

  if (!tipo || !nome || !area || nivel === undefined || !programacao)
    return res.status(400).json({ erro: 'Campos obrigatórios em falta.' });

  if (!['aluno', 'docente'].includes(tipo))
    return res.status(400).json({ erro: 'Tipo inválido.' });

  try {
    const result = await pool.query(
      `INSERT INTO submissoes (tipo, nome, turma, area, nivel, programacao, linguagens, mulher, comentario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        tipo,
        nome,
        turma || null,
        area,
        Number(nivel),
        programacao,
        linguagens ? JSON.stringify(linguagens) : null,
        mulher || null,
        comentario || null,
      ]
    );
    res.status(201).json({ id: result.rows[0].id, mensagem: 'Submetido com sucesso.' });
  } catch (err) {
    console.error('Erro ao inserir:', err.message);
    res.status(500).json({ erro: 'Erro interno ao guardar.' });
  }
});

// GET /api/submissoes
app.get('/api/submissoes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM submissoes ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: 'Erro ao obter submissões.' });
  }
});

// GET /api/estatisticas
app.get('/api/estatisticas', async (req, res) => {
  try {
    const [
      totalR, alunosR, docentesR, avgR, areaR, progR, nivelR, mulheresR, recentesR
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM submissoes'),
      pool.query("SELECT COUNT(*)::int AS n FROM submissoes WHERE tipo='aluno'"),
      pool.query("SELECT COUNT(*)::int AS n FROM submissoes WHERE tipo='docente'"),
      pool.query('SELECT ROUND(AVG(nivel)::numeric,1) AS m FROM submissoes'),
      pool.query('SELECT area, COUNT(*)::int AS total FROM submissoes GROUP BY area ORDER BY total DESC'),
      pool.query("SELECT COUNT(*)::int AS n FROM submissoes WHERE programacao='sim'"),
      pool.query(`
        SELECT
          SUM(CASE WHEN nivel BETWEEN 0 AND 3 THEN 1 ELSE 0 END)::int AS baixo,
          SUM(CASE WHEN nivel BETWEEN 4 AND 6 THEN 1 ELSE 0 END)::int AS medio,
          SUM(CASE WHEN nivel BETWEEN 7 AND 10 THEN 1 ELSE 0 END)::int AS alto
        FROM submissoes
      `),
      pool.query(`
        SELECT mulher, COUNT(*)::int AS mencoes FROM submissoes
        WHERE mulher IS NOT NULL AND TRIM(mulher) != ''
        GROUP BY LOWER(TRIM(mulher)), mulher ORDER BY mencoes DESC LIMIT 6
      `),
      pool.query('SELECT * FROM submissoes ORDER BY id DESC LIMIT 10'),
    ]);

    res.json({
      total:      totalR.rows[0].n,
      alunos:     alunosR.rows[0].n,
      docentes:   docentesR.rows[0].n,
      avgNivel:   avgR.rows[0].m || 0,
      porArea:    areaR.rows,
      comProg:    progR.rows[0].n,
      nivelDist:  nivelR.rows[0],
      mulheres:   mulheresR.rows,
      recentes:   recentesR.rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ erro: 'Erro ao obter estatísticas.' });
  }
});

// ── Boot ────────────────────────────────────────────────────────────
createSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Servidor TIC na porta ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Falha ao iniciar:', err.message);
    process.exit(1);
  });
