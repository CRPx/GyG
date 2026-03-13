const ExcelJS = require('exceljs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/solicitudes', (req, res) => {
  const sql = `
    SELECT id, fecha, empresa, pendientes, observaciones, estatus
    FROM solicitudes
    ORDER BY fecha DESC, id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener solicitudes', detalle: err });
    }
    res.json(results);
  });
});

app.get('/api/empresas', (req, res) => {
  const sql = `
    SELECT DISTINCT empresa
    FROM solicitudes
    WHERE empresa IS NOT NULL AND empresa <> ''
    ORDER BY empresa ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener empresas', detalle: err });
    }
    res.json(results.map(r => r.empresa));
  });
});

app.post('/api/solicitudes', (req, res) => {
  const { fecha, empresa, pendientes, observaciones, estatus } = req.body;

  if (!fecha || !empresa || !pendientes || !estatus) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const sql = `
    INSERT INTO solicitudes (fecha, empresa, pendientes, observaciones, estatus)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [fecha, empresa, pendientes, observaciones || '', estatus],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Error al guardar solicitud', detalle: err });
      }
      res.json({
        mensaje: 'Solicitud guardada',
        id: result.insertId
      });
    }
  );
});

app.put('/api/solicitudes/:id', (req, res) => {
  const { id } = req.params;
  const { fecha, empresa, pendientes, observaciones, estatus } = req.body;

  if (!fecha || !empresa || !pendientes || !estatus) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const sql = `
    UPDATE solicitudes
    SET fecha = ?, empresa = ?, pendientes = ?, observaciones = ?, estatus = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [fecha, empresa, pendientes, observaciones || '', estatus, id],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar solicitud', detalle: err });
      }
      res.json({ mensaje: 'Solicitud actualizada' });
    }
  );
});

app.delete('/api/solicitudes/:id', (req, res) => {
  const { id } = req.params;

  db.query('DELETE FROM solicitudes WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar solicitud', detalle: err });
    }
    res.json({ mensaje: 'Solicitud eliminada' });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/api/exportar-excel', (req, res) => {
  const sql = `
    SELECT id, fecha, empresa, pendientes, observaciones, estatus
    FROM solicitudes
    ORDER BY fecha DESC, id DESC
  `;

  db.query(sql, async (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Error al exportar', detalle: err });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Gestor de Pendientes';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Pendientes');

      worksheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 15 },
        { header: 'Empresa', key: 'empresa', width: 28 },
        { header: 'Detalles del Trabajo', key: 'pendientes', width: 45 },
        { header: 'Observaciones', key: 'observaciones', width: 40 },
        { header: 'Estatus', key: 'estatus', width: 18 }
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
        const fecha = String(item.fecha).includes('T')
          ? String(item.fecha).split('T')[0]
          : String(item.fecha).slice(0, 10);

        const row = worksheet.addRow({
          fecha,
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
      worksheet.autoFilter = 'A1:E1';

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
      res.status(500).json({ error: 'Error al generar Excel', detalle: error.message });
    }
  });
});

app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});
