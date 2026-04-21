let tasks = [];
let editingId = null;
let expandedTaskId = null;

const taskForm = document.getElementById('taskForm');
const tasksGrid = document.getElementById('tasksGrid');
const filterEmpresa = document.getElementById('filterEmpresa');
const filterEstatus = document.getElementById('filterEstatus');
const editForm = document.getElementById('editForm');
const editModal = document.getElementById('editModal');
const filterFecha = document.getElementById('filterFecha');
const filterResponsable = document.getElementById('filterResponsable');
const MIC_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`;

function attachVoice(textarea, micBtn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { micBtn.style.display = 'none'; return; }

  const recognition = new SR();
  recognition.lang = 'es-MX';
  recognition.continuous = true;
  recognition.interimResults = true;

  let isRecording = false;
  let baseText = '';

  micBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRecording) {
      recognition.stop();
    } else {
      baseText = textarea.value;
      recognition.start();
    }
  });

  recognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add('mic-recording');
    micBtn.title = 'Detener dictado';
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove('mic-recording');
    micBtn.title = 'Dictar texto por voz';
    textarea.value = textarea.value.trim();
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        baseText += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    textarea.value = baseText + interim;
  };

  recognition.onerror = (e) => {
    isRecording = false;
    micBtn.classList.remove('mic-recording');
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      console.error('Error de voz:', e.error);
    }
  };
}

function initVoiceFields() {
  const pairs = [
    ['pendientes',        'mic-pendientes'],
    ['observaciones',     'mic-observaciones'],
    ['editPendientes',    'mic-editPendientes'],
    ['editObservaciones', 'mic-editObservaciones'],
    ['iaTexto',           'mic-iaTexto'],           // ← agrega esta línea
  ];
  pairs.forEach(([taId, btnId]) => {
    const ta = document.getElementById(taId);
    const btn = document.getElementById(btnId);
    if (ta && btn) attachVoice(ta, btn);
  });
  // Asignar ícono al botón de mic de IA
  const micIa = document.getElementById('mic-iaTexto');
  if (micIa) micIa.innerHTML = MIC_SVG;
}

async function loadUsers() {
  try {
    const res = await fetch('/api/usuarios', { credentials: 'include' });
    const users = await res.json();
    // Llenar select del formulario
    const select = document.getElementById('responsable');
    if (select) {
      select.innerHTML = '<option value="">Selecciona un responsable</option>';
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.usuario;
        select.appendChild(option);
      });
    }
    // Llenar select del modal
    const editSelect = document.getElementById('editResponsable');
    if (editSelect) {
      editSelect.innerHTML = '<option value="">Selecciona un responsable</option>';
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.usuario;
        editSelect.appendChild(option);
      });
    }
    // Guardar lista para usar en la tabla de estadísticas (opcional)
    window.usersList = users;
  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}

async function loadResponsablesFilter() {
  try {
    const res = await fetch('/api/responsables', { credentials: 'include' });
    const responsables = await res.json();
    filterResponsable.innerHTML = '<option value="">Responsable</option>';
    responsables.forEach(resp => {
      const option = document.createElement('option');
      option.value = resp.id;
      option.textContent = resp.usuario;
      filterResponsable.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar responsables:', error);
  }
}

async function loadTasks() {
  try {
    const res = await fetch('/api/solicitudes', {
      credentials: 'include',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await res.json();

    tasks = data.map(item => ({
      id: item.id,
      date: formatDateForInput(item.fecha),
      createdAt: item.creado_en,
      empresa: item.empresa,
      pendientes: item.pendientes,
      observaciones: item.observaciones || '',
      estatus: item.estatus,
      responsable_id: item.responsable_id,
      responsable_nombre: item.responsable_nombre || 'Sin asignar',
      creador_nombre: item.creador_nombre || 'Sistema',   // ← agregar
      respuestas: Array.isArray(item.respuestas) ? item.respuestas : []
    }));

    renderTasks();
    updateStats();
    loadResponsablesFilter(); // ya lo tienes
  } catch (error) {
    console.error('Error al cargar solicitudes:', error);
    alert('No se pudieron cargar las solicitudes');
  }
}

function toggleTaskDetails(id) {
  expandedTaskId = expandedTaskId === id ? null : id;
  renderTasks();
}

function formatDateForInput(value) {
  if (!value) return '';
  if (typeof value === 'string' && value.includes('T')) {
    return value.split('T')[0];
  }
  return String(value).slice(0, 10);
}

function getFormattedDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getFormattedDateTime(value) {
  if (!value) return '';

  const date = new Date(value);

  const hora = date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const fecha = date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return `${hora}, ${fecha}`;
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const newTask = {
    fecha: document.getElementById('date').value,
    empresa: document.getElementById('empresa').value,
    pendientes: document.getElementById('pendientes').value,
    observaciones: document.getElementById('observaciones').value,
    estatus: document.getElementById('estatus').value,
    responsable_id: document.getElementById('responsable').value || null
  };

  try {
    const res = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error('Error backend:', data);
      alert(data?.detalle || data?.error || 'No se pudo guardar la solicitud');
      return;
    }

    taskForm.reset();
    document.getElementById('date').valueAsDate = new Date();
    await loadTasks();
  } catch (error) {
    console.error('Error al guardar solicitud:', error);
    alert(`${error.name}: ${error.message}`);
  }
});

function renderTasks() {
  const filterFechaValue = filterFecha?.value || '';
  const filterResponsableValue = filterResponsable.value;
  const filterEstatusValue = filterEstatus.value;

  let filtered = tasks.filter(task => {
    const fechaMatch = !filterFechaValue || task.date === filterFechaValue;
    const responsableMatch = !filterResponsableValue || task.responsable_id == filterResponsableValue;
    const estatusMatch = !filterEstatusValue || task.estatus === filterEstatusValue;
    return fechaMatch && responsableMatch && estatusMatch;
  });

  filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

  // Dividir en dos grupos
  const pendientesActivos = filtered.filter(t => t.estatus !== 'Completado');
  const completados = filtered.filter(t => t.estatus === 'Completado');

  tasksGrid.innerHTML = '';

  // Si no hay resultados en absoluto
  if (filtered.length === 0) {
    tasksGrid.innerHTML = `
      <div class="empty-state no-tasks">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">No hay pendientes con los filtros seleccionados</div>
      </div>
    `;
    return;
  }

  // Función auxiliar para renderizar un conjunto de tarjetas en un contenedor
  const renderGroup = (taskArray, container, groupTitle) => {
    if (taskArray.length === 0) return;

    // Crear título de sección
    const sectionTitle = document.createElement('h3');
    sectionTitle.className = 'section-title';
    sectionTitle.textContent = groupTitle;
    container.appendChild(sectionTitle);

    // Crear contenedor de tarjetas para este grupo
    const groupGrid = document.createElement('div');
    groupGrid.className = 'tasks-group-grid';
    container.appendChild(groupGrid);

    taskArray.forEach(task => {
      const isExpanded = expandedTaskId === task.id;
      const statusClass = `status-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
      const headerClass = `header-${task.estatus.toLowerCase().replace(/\s+/g, '-')}`;
      const formattedCreatedAt = getFormattedDateTime(task.createdAt);

      const statusEmoji = {
        'Pendiente': '🔴',
        'En proceso': '🟡',
        'Completado': '🟢'
      };

      const responsesHtml = task.respuestas && task.respuestas.length
        ? task.respuestas.map(item => `
            <div class="response-item">
              <div class="response-meta">${getFormattedDateTime(item.creado_en)} por ${escapeHtml(item.usuario_nombre || 'Desconocido')}</div>
              <div class="response-text">${escapeHtml(item.respuesta)}</div>
            </div>
          `).join('')
        : `<div class="response-empty">No hay respuestas aún</div>`;

      const card = document.createElement('div');
      card.className = `task-card ${statusClass} ${isExpanded ? 'expanded' : ''}`;

      card.innerHTML = `
        <div class="task-header ${headerClass}">
          <div class="task-company">${escapeHtml(task.empresa)}</div>
          <div class="task-meta" style="font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 4px;">
            Creado por ${escapeHtml(task.creador_nombre)}
          </div>
          <div class="task-date">${formattedCreatedAt}</div>
        </div>

        <div class="task-body">
          <div class="task-preview">
            <div class="task-field">
              <div class="task-field-label">Detalles del Trabajo</div>
              <div class="task-field-value">${escapeHtml(task.pendientes)}</div>
            </div>
            <div class="task-field">
              <div class="task-field-label">Responsable</div>
              <div class="task-field-value">${escapeHtml(task.responsable_nombre)}</div>
            </div>
          </div>

          <div class="task-extra">
            <div class="task-field">
              <div class="task-field-label">Observaciones</div>
              <div class="task-field-value">
                ${task.observaciones ? escapeHtml(task.observaciones) : 'Sin observaciones'}
              </div>
            </div>

            <div class="task-field">
              <div class="task-field-label">Respuestas</div>
              <div class="task-field-value responses-box">
                ${responsesHtml}
              </div>
            </div>

            <div class="task-field">
              <div class="task-field-label">Agregar respuestas</div>
              <div class="response-form" onclick="event.stopPropagation()">
                <div class="voice-field">
                  <textarea id="responseInput-${task.id}" class="response-textarea" placeholder="Escribe una respuesta para este pendiente..."></textarea>
                  <button type="button" class="mic-btn" id="mic-response-${task.id}" title="Dictar texto por voz">${MIC_SVG}</button>
                </div>
                <button
                  class="btn-small btn-edit"
                  onclick="event.stopPropagation(); addResponse(${task.id})"
                >
                  Guardar respuesta
                </button>
              </div>
            </div>

            <div class="task-field">
              <div class="task-field-label">Estatus</div>
              <span class="status-badge ${statusClass}">
                ${statusEmoji[task.estatus]} ${task.estatus}
              </span>
            </div>

            <div class="task-actions" onclick="event.stopPropagation()">
              <button
                class="btn-small btn-edit"
                onclick="event.stopPropagation(); openEditModal(${task.id})"
              >
                Editar
              </button>

              <button
                class="btn-small btn-delete"
                onclick="event.stopPropagation(); deleteTask(${task.id})"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => toggleTaskDetails(task.id));
      groupGrid.appendChild(card);

      if (isExpanded) {
        const responseTa  = card.querySelector(`#responseInput-${task.id}`);
        const responseMic = card.querySelector(`#mic-response-${task.id}`);
        if (responseTa && responseMic) attachVoice(responseTa, responseMic);
      }
    });
  };

  // Renderizar grupo de pendientes activos (no completados)
  renderGroup(pendientesActivos, tasksGrid, '📋 Pendientes activos');

  // Renderizar grupo de completados
  renderGroup(completados, tasksGrid, '✅ Completados');
}

async function addResponse(taskId) {
  const input = document.getElementById(`responseInput-${taskId}`);
  if (!input) return;

  const respuesta = input.value.trim();

  if (!respuesta) {
    alert('Escribe una respuesta antes de guardar.');
    return;
  }

  try {
    const res = await fetch(`/api/solicitudes/${taskId}/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuesta })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      alert(data?.detalle || data?.error || 'No se pudo guardar la respuesta');
      return;
    }

    await loadTasks();
    expandedTaskId = taskId;
    renderTasks();
  } catch (error) {
    console.error('Error al guardar respuesta:', error);
    alert('No se pudo guardar la respuesta');
  }
}

function updateStats() {
  const statsByUser = {};
  tasks.forEach(task => {
    const userId = task.responsable_id;
    const userName = task.responsable_nombre;
    if (!userId) return; // si no tiene asignado, lo omitimos (puedes decidir si mostrarlo como "Sin asignar")
    if (!statsByUser[userId]) {
      statsByUser[userId] = {
        nombre: userName,
        total: 0,
        pendiente: 0,
        enProceso: 0,
        completado: 0
      };
    }
    statsByUser[userId].total++;
    if (task.estatus === 'Pendiente') statsByUser[userId].pendiente++;
    else if (task.estatus === 'En proceso') statsByUser[userId].enProceso++;
    else if (task.estatus === 'Completado') statsByUser[userId].completado++;
  });

  const tbody = document.getElementById('statsTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    const sorted = Object.values(statsByUser).sort((a, b) => a.nombre.localeCompare(b.nombre));
    sorted.forEach(stat => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = stat.nombre;
      row.insertCell(1).textContent = stat.total;
      row.insertCell(2).textContent = stat.pendiente;
      row.insertCell(3).textContent = stat.enProceso;
      row.insertCell(4).textContent = stat.completado;
    });
  }
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingId = id;
  document.getElementById('editDate').value = task.date;
  document.getElementById('editEmpresa').value = task.empresa;
  document.getElementById('editPendientes').value = task.pendientes;
  document.getElementById('editObservaciones').value = task.observaciones;
  document.getElementById('editEstatus').value = task.estatus;

  const editResponsableSelect = document.getElementById('editResponsable');
  if (editResponsableSelect) {
    editResponsableSelect.value = task.responsable_id || '';
  }
  editModal.style.display = 'block';

  
}

function closeModal() {
  editModal.style.display = 'none';
  editingId = null;
}

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingId) return;

  const updatedTask = {
    fecha: document.getElementById('editDate').value,
    empresa: document.getElementById('editEmpresa').value,
    pendientes: document.getElementById('editPendientes').value,
    observaciones: document.getElementById('editObservaciones').value,
    estatus: document.getElementById('editEstatus').value,
    responsable_id: document.getElementById('editResponsable').value || null
  };

  try {
    const res = await fetch(`/api/solicitudes/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updatedTask)
    });

    if (!res.ok) throw new Error('Error al actualizar');

    closeModal();
    await loadTasks();
  } catch (error) {
    console.error('Error al actualizar solicitud:', error);
    alert('No se pudo actualizar la solicitud');
  }
});

async function deleteTask(id) {
  const confirmacion = confirm('¿Estás seguro de que deseas eliminar este pendiente?');
  if (!confirmacion) return;

  try {
    const res = await fetch(`/api/solicitudes/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!res.ok) throw new Error('Error al eliminar');

    await loadTasks();
  } catch (error) {
    console.error('Error al eliminar solicitud:', error);
    alert('No se pudo eliminar la solicitud');
  }
}

function exportData() {
  window.location.href = '/api/exportar-excel';
}

function clearFilters() {
  if (filterFecha) filterFecha.value = '';
  if (filterResponsable) filterResponsable.value = '';
  filterEstatus.value = '';
  renderTasks();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if (filterFecha) filterFecha.addEventListener('change', renderTasks);
if (filterResponsable) filterResponsable.addEventListener('change', renderTasks);
filterEstatus.addEventListener('change', renderTasks);

window.addEventListener('click', (e) => {
  if (e.target === editModal) closeModal();
});

document.getElementById('date').valueAsDate = new Date();
loadTasks();
loadResponsablesFilter();
loadUsers();
initVoiceFields();

window.openEditModal = openEditModal;
window.closeModal = closeModal;
window.deleteTask = deleteTask;
window.exportData = exportData;
window.clearFilters = clearFilters;
window.addResponse = addResponse;

// ── Mobile FAB toggle ──────────────────────────────────────
(function () {
  const fab       = document.getElementById('fabNew');
  const panel     = document.getElementById('rightPanel');
  const closeBtn  = document.getElementById('mobileFormClose');
  const isMobile  = () => window.innerWidth <= 768;

  function openPanel() {
    panel.classList.add('mobile-open');
    panel.style.display = '';
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panel.classList.remove('mobile-open');
    if (isMobile()) panel.style.display = 'none';
    document.body.style.overflow = '';
  }

  if (fab) {
    fab.addEventListener('click', openPanel);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  // Mostrar/ocultar FAB y panel según tamaño de ventana
  function handleResize() {
    if (!fab || !panel) return;
    if (isMobile()) {
      fab.style.display = 'flex';
      if (!panel.classList.contains('mobile-open')) {
        panel.style.display = 'none';
      }
    } else {
      fab.style.display = 'none';
      panel.style.display = '';
      panel.classList.remove('mobile-open');
      document.body.style.overflow = '';
    }
  }

  // Cerrar panel al guardar con éxito (cuando el form hace reset)
  const form = document.getElementById('taskForm');
  if (form) {
    form.addEventListener('reset', () => {
      if (isMobile()) closePanel();
    });
  }

  window.addEventListener('resize', handleResize);
  handleResize(); // estado inicial
})();

// ── Mobile FAB — abrir/cerrar panel de nuevo pendiente ──
const fabNew       = document.getElementById('fabNew');
const rightPanel   = document.querySelector('.right-panel');
const mobileClose  = document.getElementById('mobileFormClose');

if (fabNew && rightPanel) {
  fabNew.addEventListener('click', () => {
    rightPanel.classList.add('mobile-open');
    // Scroll al tope del panel al abrirlo
    rightPanel.scrollTop = 0;
  });
}

if (mobileClose && rightPanel) {
  mobileClose.addEventListener('click', () => {
    rightPanel.classList.remove('mobile-open');
  });
}

// Cerrar panel mobile al guardar el formulario exitosamente
const originalSubmit = taskForm.onsubmit;
taskForm.addEventListener('submit', async () => {
  // Esperar un momento a que se procese el guardado
  setTimeout(() => {
    if (rightPanel) rightPanel.classList.remove('mobile-open');
  }, 600);
});

async function iaLlenarFormulario(tipo) {
  const texto = document.getElementById('iaTexto').value.trim();
  const status = document.getElementById('iaStatus');
  const btn = document.getElementById('iaBtnOficina');

  if (!texto) {
    alert('Escribe una descripción primero');
    return;
  }

  status.style.display = 'block';
  status.textContent = '⏳ Procesando con IA...';
  btn.disabled = true;

  try {
    const endpoint = tipo === 'empresas'
      ? '/api/ia/crear-pendiente-empresas'
      : '/api/ia/crear-pendiente';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ texto })
    });

    const data = await res.json();

    if (!res.ok) {
      status.textContent = '❌ Error: ' + (data.error || 'No se pudo procesar');
      return;
    }

    // Llenar campos básicos
    if (data.fecha)        document.getElementById('date').value         = data.fecha;
    if (data.empresa)      document.getElementById('empresa').value      = data.empresa;
    if (data.pendientes)   document.getElementById('pendientes').value   = data.pendientes;
    if (data.observaciones)document.getElementById('observaciones').value= data.observaciones;
    if (data.estatus) {
      const select = document.getElementById('estatus');
      for (let opt of select.options) {
        if (opt.value === data.estatus) { select.value = data.estatus; break; }
      }
    }

    // 🆕 Asignar responsable si se reconoció un nombre
    if (data.responsable_nombre) {
      const responsableSelect = document.getElementById('responsable');
      const nombreBuscado = data.responsable_nombre.trim().toLowerCase();
      let encontrado = false;

      for (let opt of responsableSelect.options) {
        if (opt.text.trim().toLowerCase() === nombreBuscado) {
          responsableSelect.value = opt.value;
          encontrado = true;
          break;
        }
      }

      // Búsqueda parcial (contiene) como fallback
      if (!encontrado) {
        for (let opt of responsableSelect.options) {
          if (opt.text.trim().toLowerCase().includes(nombreBuscado)) {
            responsableSelect.value = opt.value;
            encontrado = true;
            break;
          }
        }
      }

      if (!encontrado) {
        console.warn('Responsable no encontrado en la lista:', data.responsable_nombre);
      }
    }

    document.getElementById('iaTexto').value = '';
    status.textContent = '✅ Formulario llenado. Revisa y guarda.';
    setTimeout(() => { status.style.display = 'none'; }, 4000);

  } catch (err) {
    status.textContent = '❌ Error de conexión';
    console.error('Error IA:', err);
  } finally {
    btn.disabled = false;
  }
}