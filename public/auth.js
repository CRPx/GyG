const loginForm = document.getElementById('loginForm');
const registroForm = document.getElementById('registroForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const usuario = document.getElementById('usuario').value.trim();
    const pin = document.getElementById('pin').value.trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, pin })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || data?.detalle || 'No se pudo iniciar sesión');
        return;
      }

      localStorage.setItem('loggedUserName', data.usuario);
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
