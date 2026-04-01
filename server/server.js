require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');
const db = require('./db');
const crypto = require('crypto');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const app = express();
app.set('trust proxy', 1);

const CLAVE_REGISTRO = process.env.CLAVE_REGISTRO;
const SESSION_SECRET = process.env.SESSION_SECRET;

const sessionStore = new MySQLStore({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
});

sessionStore.onReady().then(() => {
  console.log('MySQLStore lista y conectada');
}).catch(err => {
  console.error('Error al conectar MySQLStore:', err);
});

if (!CLAVE_REGISTRO) {
  throw new Error('Falta CLAVE_REGISTRO en el archivo .env');
}

if (!SESSION_SECRET) {
  throw new Error('Falta SESSION_SECRET en el archivo .env');
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin));
}

app.use(express.json());
app.use(session({
  name: 'gyg_sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,   // ← aquí el cambio clave
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 1000 * 60 * 60 * 8,
    path: '/'
  }
}));

app.get('/', (req, res) => {
  console.log('=== Acceso a raíz ===');
  console.log('Session ID:', req.session.id);
  console.log('Session user:', req.session.user);
  console.log('Cookie header:', req.headers.cookie);

  if (req.session && req.session.user) {
    console.log('➡️ Redirigiendo a panel.html');
    return res.redirect('/panel.html');
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});


app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

function formatFechaExcel(value) {
  if (!value) return '';

  if (value instanceof Date && !isNaN(value)) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'string') {
    if (value.includes('T')) return value.split('T')[0];
    return value.slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function formatFechaHoraExcel(value) {
  if (!value) return '';

  const date = new Date(value);
  if (isNaN(date)) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

app.post('/api/auth/registro', (req, res) => {
  const { usuario, pin, confirmarPin, claveRegistro } = req.body;

  const usuarioLimpio = String(usuario || '').trim();
  const pinLimpio = String(pin || '').trim();
  const confirmarPinLimpio = String(confirmarPin || '').trim();
  const claveRegistroLimpia = String(claveRegistro || '').trim();

  if (!usuarioLimpio || !pinLimpio || !confirmarPinLimpio || !claveRegistroLimpia) {
    return res.status(400).json({
      error: 'Todos los campos son obligatorios'
    });
  }

  if (!isValidPin(pinLimpio)) {
    return res.status(400).json({
      error: 'El pin debe tener exactamente 4 dígitos'
    });
  }

  if (pinLimpio !== confirmarPinLimpio) {
    return res.status(400).json({
      error: 'La confirmación del pin no coincide'
    });
  }

  if (claveRegistroLimpia !== CLAVE_REGISTRO) {
    return res.status(403).json({
      error: 'La clave para registro es incorrecta'
    });
  }

  db.query(
    'SELECT id FROM usuarios WHERE usuario = ?',
    [usuarioLimpio],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          error: 'Error al validar usuario',
          detalle: err.message
        });
      }

      if (results.length > 0) {
        return res.status(409).json({
          error: 'Ese usuario ya existe'
        });
      }

      db.query(
        'INSERT INTO usuarios (usuario, pin_hash) VALUES (?, ?)',
        [usuarioLimpio, hashPin(pinLimpio)],
        (insertErr, result) => {
          if (insertErr) {
            return res.status(500).json({
              error: 'Error al registrar usuario',
              detalle: insertErr.message
            });
          }

          res.json({
            mensaje: 'Usuario registrado correctamente',
            id: result.insertId,
            usuario: usuarioLimpio
          });
        }
      );
    }
  );
});

app.get('/api/usuarios', requireAuth, (req, res) => {
  db.query('SELECT id, usuario FROM usuarios ORDER BY usuario', (err, results) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      return res.status(500).json({ error: 'Error al obtener usuarios' });
    }
    res.json(results);
  });
});

app.post('/api/auth/login', (req, res) => {
  console.log('➡️  Login recibido:', req.body.usuario);
  const { usuario, pin } = req.body;
  const usuarioLimpio = String(usuario || '').trim();
  const pinLimpio = String(pin || '').trim();

  if (!usuarioLimpio || !pinLimpio) {
    return res.status(400).json({
      error: 'Usuario y pin son obligatorios'
    });
  }

  db.query(
    'SELECT id, usuario, pin_hash FROM usuarios WHERE usuario = ?',
    [usuarioLimpio],
    (err, results) => {
      if (err) {
        console.error('Error al iniciar sesión:', err);
        return res.status(500).json({
          error: 'Error al iniciar sesión',
          detalle: err.message
        });
      }

      if (results.length === 0) {
        return res.status(401).json({
          error: 'Usuario o pin incorrectos'
        });
      }

      const user = results[0];
      const pinHash = hashPin(pinLimpio);

      if (user.pin_hash !== pinHash) {
        return res.status(401).json({
          error: 'Usuario o pin incorrectos'
        });
      }

       console.log('✅ Usuario autenticado:', user.id);
      req.session.user = {
        id: user.id,
        usuario: user.usuario
      };


      // Guarda explícitamente antes de responder
      req.session.save((err) => {
        if (err) {
          console.error('❌ Error guardando sesión:', err);
          return res.status(500).json({ error: 'Error al guardar sesión' });
        }
        console.log('💾 Sesión guardada. ID:', req.session.id);
        res.json({ mensaje: 'Inicio de sesión correcto', usuario: user.usuario });
      });



    }
  );
});

  app.get('/api/auth/me', (req, res) => {
    console.log('Session en /me:', req.session);
    if (!req.session || !req.session.user) {
      return res.status(401).json({ authenticated: false });
    }

    res.json({ authenticated: true, user: req.session.user });
  });

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'No se pudo cerrar la sesión' });
    }

    res.clearCookie('gyg_sid');
    res.json({ mensaje: 'Sesión cerrada' });
  });
});


app.get('/api/solicitudes', requireAuth, (req, res) => {
  console.log('Petición a /api/solicitudes recibida');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const sql = `
  SELECT
      s.id,
      s.fecha,
      s.creado_en,
      s.empresa,
      s.pendientes,
      s.observaciones,
      s.estatus,
      s.responsable_id,
      u_resp.usuario AS responsable_nombre,
      s.creado_por_id,
      u_creador.usuario AS creador_nombre,
      r.id AS respuesta_id,
      r.respuesta,
      r.creado_en AS respuesta_creado_en,
      r.usuario_id AS respuesta_usuario_id,
      u_respuesta.usuario AS respuesta_usuario_nombre
    FROM solicitudes1 s
    LEFT JOIN usuarios u_resp ON u_resp.id = s.responsable_id
    LEFT JOIN usuarios u_creador ON u_creador.id = s.creado_por_id
    LEFT JOIN solicitud_respuestas r ON r.solicitud_id = s.id
    LEFT JOIN usuarios u_respuesta ON u_respuesta.id = r.usuario_id
    ORDER BY s.creado_en DESC, s.id DESC, r.creado_en ASC, r.id ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error SQL detallado:', err);
      return res.status(500).json({ error: err.message });
    }

    const grouped = [];
    const map = new Map();

    results.forEach(row => {
      if (!map.has(row.id)) {
          const task = {
            id: row.id,
            fecha: row.fecha,
            creado_en: row.creado_en,
            empresa: row.empresa,
            pendientes: row.pendientes,
            observaciones: row.observaciones || '',
            estatus: row.estatus,
            responsable_id: row.responsable_id,
            responsable_nombre: row.responsable_nombre || 'Sin asignar',
            creado_por_id: row.creado_por_id,
            creador_nombre: row.creador_nombre || 'Sistema',
            respuestas: []
          };

        map.set(row.id, task);
        grouped.push(task);
      }

      if (row.respuesta_id) {
        map.get(row.id).respuestas.push({
          id: row.respuesta_id,
          respuesta: row.respuesta,
          creado_en: row.respuesta_creado_en,
          usuario_id: row.respuesta_usuario_id,
          usuario_nombre: row.respuesta_usuario_nombre || 'Anónimo'
        });
      }
    });

    res.json(grouped);
  });
});

app.post('/api/solicitudes', requireAuth, (req, res) => {
  console.log('Body recibido:', req.body);

  const { fecha, empresa, pendientes, observaciones, estatus, responsable_id } = req.body;
  const creado_por_id = req.session.user.id; // usuario logueado

  if (!fecha || !empresa || !pendientes || !estatus) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios'
    });
  }

  const sql = `
    INSERT INTO solicitudes1 (fecha, empresa, pendientes, observaciones, estatus, responsable_id, creado_por_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [fecha, empresa, pendientes, observaciones || '', estatus, responsable_id || null, creado_por_id],
    (err, result) => {
      if (err) {
        console.error('Error al guardar solicitud:', err);
        return res.status(500).json({
          error: 'Error al guardar solicitud',
          detalle: err.message
        });
      }

      res.json({
        mensaje: 'Solicitud guardada',
        id: result.insertId
      });
    }
  );
});

app.put('/api/solicitudes/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { fecha, empresa, pendientes, observaciones, estatus, responsable_id } = req.body;

  if (!fecha || !empresa || !pendientes || !estatus) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios'
    });
  }

  const sql = `
    UPDATE solicitudes1
    SET fecha = ?, empresa = ?, pendientes = ?, observaciones = ?, estatus = ?, responsable_id = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [fecha, empresa, pendientes, observaciones || '', estatus, responsable_id || null, id],
    (err, result) => {
      if (err) {
        console.error('Error al actualizar solicitud:', err);
        return res.status(500).json({
          error: 'Error al actualizar solicitud',
          detalle: err.message
        });
      }

      res.json({
        mensaje: 'Solicitud actualizada',
        filasAfectadas: result.affectedRows
      });
    }
  );
});

app.delete('/api/solicitudes/:id', requireAuth, (req, res) => {
  const { id } = req.params;

  db.query(
    'DELETE FROM solicitudes1 WHERE id = ?',
    [id],
    (err, result) => {
      if (err) {
        console.error('Error al eliminar solicitud:', err);
        return res.status(500).json({
          error: 'Error al eliminar solicitud',
          detalle: err.message
        });
      }

      res.json({
        mensaje: 'Solicitud eliminada',
        filasAfectadas: result.affectedRows
      });
    }
  );
});

app.post('/api/solicitudes/:id/respuestas', requireAuth, (req, res) => {
  const { id } = req.params;
  const { respuesta } = req.body;
  const usuario_id = req.session.user.id;

  if (!respuesta || !respuesta.trim()) {
    return res.status(400).json({
      error: 'La respuesta es obligatoria'
    });
  }

  const sql = `
    INSERT INTO solicitud_respuestas (solicitud_id, respuesta, usuario_id)
    VALUES (?, ?, ?)
  `;

  db.query(sql, [id, respuesta.trim(), usuario_id], (err, result) => {
    if (err) {
      console.error('Error al guardar respuesta:', err);
      return res.status(500).json({
        error: 'Error al guardar respuesta',
        detalle: err.message
      });
    }

    res.json({
      mensaje: 'Respuesta guardada',
      id: result.insertId
    });
  });
});

app.get('/api/exportar-excel', requireAuth, (req, res) => {
  const sql = `
    SELECT s.id, s.fecha, s.creado_en, s.empresa, s.pendientes, s.observaciones, s.estatus, u.usuario AS responsable_nombre
    FROM solicitudes1 s
    LEFT JOIN usuarios u ON u.id = s.responsable_id
    ORDER BY s.creado_en DESC, s.id DESC
  `;

  db.query(sql, async (err, results) => {
    if (err) {
      console.error('Error al exportar:', err);
      return res.status(500).json({
        error: 'Error al exportar',
        detalle: err.message
      });
    }
  
  

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Gestor de Pendientes';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Pendientes');

      worksheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Creado en', key: 'creado_en', width: 22 },
        { header: 'Empresa', key: 'empresa', width: 28 },
        { header: 'Detalles del Trabajo', key: 'pendientes', width: 45 },
        { header: 'Observaciones', key: 'observaciones', width: 40 },
        { header: 'Estatus', key: 'estatus', width: 18 },
        { header: 'Responsable', key: 'responsable_nombre', width: 20 }
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.height = 22;

      headerRow.eachCell((cell) => {
        cell.font = {
          bold: true,
          color: { argb: 'FFFFFFFF' },
          name: 'Calibri',
          size: 12
        };

        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF667EEA' }
        };

        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle'
        };

        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      results.forEach((item) => {
        const row = worksheet.addRow({
          fecha: formatFechaExcel(item.fecha),
          creado_en: formatFechaHoraExcel(item.creado_en),
          empresa: item.empresa || '',
          pendientes: item.pendientes || '',
          observaciones: item.observaciones || '',
          estatus: item.estatus || ''
        });

        row.eachCell((cell) => {
          cell.alignment = {
            vertical: 'top',
            horizontal: 'left',
            wrapText: true
          };

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
            right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
          };

          cell.font = {
            name: 'Calibri',
            size: 11
          };
        });

        const estatusCell = row.getCell('estatus');

        if (item.estatus === 'Pendiente') {
          estatusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE5E5' }
          };
          estatusCell.font = {
            bold: true,
            color: { argb: 'FFD32F2F' }
          };
        } else if (item.estatus === 'En proceso') {
          estatusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF3E0' }
          };
          estatusCell.font = {
            bold: true,
            color: { argb: 'FFF57C00' }
          };
        } else if (item.estatus === 'Completado') {
          estatusCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F5E9' }
          };
          estatusCell.font = {
            bold: true,
            color: { argb: 'FF388E3C' }
          };
        }
      });

      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
      worksheet.autoFilter = 'A1:F1';

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="pendientes-${new Date().toISOString().split('T')[0]}.xlsx"`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error al generar Excel:', error);
      res.status(500).json({
        error: 'Error al generar Excel',
        detalle: error.message
      });
    }
  });
});

  // Obtener lista de responsables que tienen al menos un pendiente asignado
  app.get('/api/responsables', requireAuth, (req, res) => {
    const sql = `
      SELECT DISTINCT u.id, u.usuario
      FROM usuarios u
      INNER JOIN solicitudes1 s ON s.responsable_id = u.id
      ORDER BY u.usuario
    `;
    db.query(sql, (err, results) => {
      if (err) {
        console.error('Error al obtener responsables:', err);
        return res.status(500).json({ error: 'Error al obtener responsables' });
      }
      res.json(results);
    });
  });


const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════
// RUTAS EMPRESAS (tabla: solicitudes_empresas)
// ══════════════════════════════════════════

app.get('/api/solicitudes-empresas', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const sql = `
    SELECT
      s.id, s.fecha, s.creado_en, s.empresa, s.pendientes, s.observaciones, s.estatus,
      s.responsable_id, u_resp.usuario AS responsable_nombre,
      s.creado_por_id, u_creador.usuario AS creador_nombre,
      r.id AS respuesta_id, r.respuesta,
      r.creado_en AS respuesta_creado_en, r.usuario_id AS respuesta_usuario_id,
      u_respuesta.usuario AS respuesta_usuario_nombre
    FROM solicitudes_empresas s
    LEFT JOIN usuarios u_resp ON u_resp.id = s.responsable_id
    LEFT JOIN usuarios u_creador ON u_creador.id = s.creado_por_id
    LEFT JOIN solicitud_respuestas_empresas r ON r.solicitud_id = s.id
    LEFT JOIN usuarios u_respuesta ON u_respuesta.id = r.usuario_id
    ORDER BY s.creado_en DESC, s.id DESC, r.creado_en ASC, r.id ASC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const grouped = [];
    const map = new Map();
    results.forEach(row => {
      if (!map.has(row.id)) {
        const task = {
          id: row.id, fecha: row.fecha, creado_en: row.creado_en,
          empresa: row.empresa, pendientes: row.pendientes,
          observaciones: row.observaciones || '', estatus: row.estatus,
          responsable_id: row.responsable_id,
          responsable_nombre: row.responsable_nombre || 'Sin asignar',
          creado_por_id: row.creado_por_id,
          creador_nombre: row.creador_nombre || 'Sistema',
          respuestas: []
        };
        map.set(row.id, task);
        grouped.push(task);
      }
      if (row.respuesta_id) {
        map.get(row.id).respuestas.push({
          id: row.respuesta_id, respuesta: row.respuesta,
          creado_en: row.respuesta_creado_en, usuario_id: row.respuesta_usuario_id,
          usuario_nombre: row.respuesta_usuario_nombre || 'Anónimo'
        });
      }
    });
    res.json(grouped);
  });
});

app.post('/api/solicitudes-empresas', requireAuth, (req, res) => {
  const { fecha, empresa, pendientes, observaciones, estatus, responsable_id } = req.body;
  const creado_por_id = req.session.user.id;
  if (!fecha || !empresa || !pendientes || !estatus)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  const sql = `INSERT INTO solicitudes_empresas (fecha, empresa, pendientes, observaciones, estatus, responsable_id, creado_por_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.query(sql, [fecha, empresa, pendientes, observaciones || '', estatus, responsable_id || null, creado_por_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error al guardar', detalle: err.message });
    res.json({ mensaje: 'Solicitud guardada', id: result.insertId });
  });
});

app.put('/api/solicitudes-empresas/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { fecha, empresa, pendientes, observaciones, estatus, responsable_id } = req.body;
  if (!fecha || !empresa || !pendientes || !estatus)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  const sql = `UPDATE solicitudes_empresas SET fecha=?, empresa=?, pendientes=?, observaciones=?, estatus=?, responsable_id=? WHERE id=?`;
  db.query(sql, [fecha, empresa, pendientes, observaciones || '', estatus, responsable_id || null, id], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar', detalle: err.message });
    res.json({ mensaje: 'Solicitud actualizada' });
  });
});

app.delete('/api/solicitudes-empresas/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM solicitudes_empresas WHERE id=?', [id], (err) => {
    if (err) return res.status(500).json({ error: 'Error al eliminar', detalle: err.message });
    res.json({ mensaje: 'Solicitud eliminada' });
  });
});

app.post('/api/solicitudes-empresas/:id/respuestas', requireAuth, (req, res) => {
  const { id } = req.params;
  const { respuesta } = req.body;
  const usuario_id = req.session.user.id;
  if (!respuesta || !respuesta.trim())
    return res.status(400).json({ error: 'La respuesta es obligatoria' });
  const sql = `INSERT INTO solicitud_respuestas_empresas (solicitud_id, respuesta, usuario_id) VALUES (?, ?, ?)`;
  db.query(sql, [id, respuesta.trim(), usuario_id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error al guardar respuesta', detalle: err.message });
    res.json({ mensaje: 'Respuesta guardada', id: result.insertId });
  });
});

app.get('/api/responsables-empresas', requireAuth, (req, res) => {
  const sql = `SELECT DISTINCT u.id, u.usuario FROM usuarios u INNER JOIN solicitudes_empresas s ON s.responsable_id = u.id ORDER BY u.usuario`;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al obtener responsables' });
    res.json(results);
  });
});

app.get('/api/exportar-excel-empresas', requireAuth, (req, res) => {
  const sql = `SELECT s.id, s.fecha, s.creado_en, s.empresa, s.pendientes, s.observaciones, s.estatus, u.usuario AS responsable_nombre FROM solicitudes_empresas s LEFT JOIN usuarios u ON u.id = s.responsable_id ORDER BY s.creado_en DESC`;
  db.query(sql, async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al exportar', detalle: err.message });
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Empresas');
      worksheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Creado en', key: 'creado_en', width: 22 },
        { header: 'Empresa', key: 'empresa', width: 28 },
        { header: 'Detalles del Trabajo', key: 'pendientes', width: 45 },
        { header: 'Observaciones', key: 'observaciones', width: 40 },
        { header: 'Estatus', key: 'estatus', width: 18 },
        { header: 'Responsable', key: 'responsable_nombre', width: 20 }
      ];
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 12 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2B6D' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      results.forEach(item => {
        worksheet.addRow({
          fecha: formatFechaExcel(item.fecha),
          creado_en: formatFechaHoraExcel(item.creado_en),
          empresa: item.empresa || '',
          pendientes: item.pendientes || '',
          observaciones: item.observaciones || '',
          estatus: item.estatus || '',
          responsable_nombre: item.responsable_nombre || ''
        });
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="empresas-${new Date().toISOString().split('T')[0]}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      res.status(500).json({ error: 'Error al generar Excel', detalle: error.message });
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
});
