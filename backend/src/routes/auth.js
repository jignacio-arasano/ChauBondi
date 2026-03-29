const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const supabase  = require('../db');
const auth      = require('../middleware/auth');

const router = express.Router();

const DOMINIO_VALIDO = '@soysiglo.21.edu.ar';

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, nombre, apellido, whatsapp } = req.body;

    // Validaciones básicas
    if (!email || !password || !nombre || !apellido || !whatsapp) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    // Validar dominio institucional
    if (!email.toLowerCase().endsWith(DOMINIO_VALIDO)) {
      return res.status(400).json({
        error: `Solo se pueden registrar correos ${DOMINIO_VALIDO}`
      });
    }

    // Validar password
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    // Validar formato de WhatsApp (solo números, mínimo 10)
    const waClean = whatsapp.replace(/\D/g, '');
    if (waClean.length < 10) {
      return res.status(400).json({ error: 'Número de WhatsApp inválido.' });
    }

    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    // Hash de contraseña
    const password_hash = await bcrypt.hash(password, 12);

    // Crear perfil
    const { data: profile, error } = await supabase
      .from('profiles')
      .insert({
        email:         email.toLowerCase(),
        password_hash,
        nombre:        nombre.trim(),
        apellido:      apellido.trim(),
        whatsapp:      waClean
      })
      .select('id, email, nombre, apellido, whatsapp, rating_promedio')
      .single();

    if (error) throw error;

    // Generar JWT
    const token = jwt.sign(
      { id: profile.id, email: profile.email, nombre: profile.nombre, apellido: profile.apellido },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, user: profile });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error al crear la cuenta. Intentá de nuevo.' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos.' });
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, nombre, apellido, whatsapp, rating_promedio, password_hash, activo')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !profile) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    if (!profile.activo) {
      return res.status(403).json({ error: 'Tu cuenta está suspendida.' });
    }

    const passwordOk = await bcrypt.compare(password, profile.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { id: profile.id, email: profile.email, nombre: profile.nombre, apellido: profile.apellido },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    const { password_hash, ...userPublic } = profile;
    res.json({ token, user: userPublic });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, nombre, apellido, whatsapp, rating_promedio, rating_count, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Perfil no encontrado.' });
    }

    res.json(profile);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Error al obtener el perfil.' });
  }
});

// ─── PATCH /api/auth/profile ─────────────────────────────────────────────────
router.patch('/profile', auth, async (req, res) => {
  try {
    const { whatsapp } = req.body;
    const updates = {};

    if (whatsapp) {
      const waClean = whatsapp.replace(/\D/g, '');
      if (waClean.length < 10) {
        return res.status(400).json({ error: 'Número de WhatsApp inválido.' });
      }
      updates.whatsapp = waClean;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nada para actualizar.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select('id, email, nombre, apellido, whatsapp, rating_promedio')
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Error al actualizar el perfil.' });
  }
});

module.exports = router;
