const loginForm = document.getElementById('loginForm');
const registroForm = document.getElementById('registroForm');

async function getCurrentUser() {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.user || null;
  } catch (error) {
    return null;
  }
}

async function handlePageGuards() {
  const page = document.body.dataset.page;
  const currentUser = await getCurrentUser();

  const publicPages = ['index', 'login', 'registro'];
  const privatePages = ['panel', 'oficina'];

  if (publicPages.includes(page) && currentUser) {
    window.location.href = 'panel.html';
    return;
  }

  if (privatePages.includes(page) && !currentUser) {
    window.location.href = 'login.html';
    return;
  }

  if (page === 'panel' && currentUser) {
    const userNode = document.getElementById('loggedUserName');
    if (userNode) {
      userNode.textContent = currentUser.usuario;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await handlePageGuards();

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const usuario = document.getElementById('usuario').value.trim();
      const pin = document.getElementById('pin').value.trim();

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ usuario, pin })
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          alert(data?.error || data?.detalle || 'No se pudo iniciar sesión');
          return;
        }

        window.location.href = 'panel.html';
      } catch (error) {
        console.error('Error al iniciar sesión:', error);
        alert('Error de conexión al iniciar sesión');
      }
    });
  }

  if (registroForm) {
    registroForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const usuario = document.getElementById('nuevoUsuario').value.trim();
      const pin = document.getElementById('pinRegistro').value.trim();
      const confirmarPin = document.getElementById('confirmarPin').value.trim();
      const claveRegistro = document.getElementById('claveRegistro').value.trim();

      if (!/^\d{4}$/.test(pin)) {
        alert('El pin debe tener exactamente 4 dígitos');
        return;
      }

      if (pin !== confirmarPin) {
        alert('La confirmación del pin no coincide');
        return;
      }

      try {
        const res = await fetch('/api/auth/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ usuario, pin, confirmarPin, claveRegistro })
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          alert(data?.error || data?.detalle || 'No se pudo registrar el usuario');
          return;
        }

        alert('Usuario registrado correctamente');
        window.location.href = 'login.html';
      } catch (error) {
        console.error('Error al registrar usuario:', error);
        alert('Error de conexión al registrar usuario');
      }
    });
  }
});

async function cerrarSesion() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }

  window.location.href = 'login.html';
}

window.cerrarSesion = cerrarSesion;