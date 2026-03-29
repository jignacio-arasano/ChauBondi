const express  = require('express');
const supabase = require('../db');
const auth     = require('../middleware/auth');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const router = express.Router();

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// ─── GET /api/trips ──────────────────────────────────────────────────────────
// Query params: tipo, zona, fecha (YYYY-MM-DD)
router.get('/', auth, async (req, res) => {
  try {
    const { tipo, zona, fecha } = req.query;

    let query = supabase
      .from('viajes')
      .select(`
        id, tipo, zona_comun, barrio, fecha_hora, cupos_disponibles, activo, created_at,
        profiles:id_creador ( id, nombre, apellido, rating_promedio )
      `)
      .eq('activo', true)
      .gt('cupos_disponibles', 0)
      .gt('fecha_hora', new Date().toISOString())
      .order('fecha_hora', { ascending: true });

    if (tipo) query = query.eq('tipo', tipo);
    if (zona) query = query.eq('zona_comun', zona);
    if (fecha) {
      const start = new Date(fecha);
      start.setHours(0, 0, 0, 0);
      const end = new Date(fecha);
      end.setHours(23, 59, 59, 999);
      query = query
        .gte('fecha_hora', start.toISOString())
        .lte('fecha_hora', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Get trips error:', err);
    res.status(500).json({ error: 'Error al obtener los viajes.' });
  }
});

// ─── POST /api/trips ─────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { tipo, zona_comun, barrio, fecha_hora } = req.body;

    if (!tipo || !zona_comun || !barrio || !fecha_hora) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (!['IDA', 'VUELTA'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo debe ser IDA o VUELTA.' });
    }

    const fechaViaje = new Date(fecha_hora);
    if (isNaN(fechaViaje.getTime()) || fechaViaje <= new Date()) {
      return res.status(400).json({ error: 'La fecha debe ser en el futuro.' });
    }

    // Verificar duplicado del creador (mismo tipo + día)
    const startOfDay = new Date(fechaViaje);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(fechaViaje);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: myDuplicate } = await supabase
      .from('viajes')
      .select('id')
      .eq('id_creador', req.user.id)
      .eq('tipo', tipo)
      .eq('activo', true)
      .gte('fecha_hora', startOfDay.toISOString())
      .lte('fecha_hora', endOfDay.toISOString());

    if (myDuplicate && myDuplicate.length > 0) {
      return res.status(409).json({
        error: 'Ya tenés un viaje del mismo tipo publicado para ese día.'
      });
    }

    // Verificar duplicado global (misma zona + fecha/hora exacta)
    const fechaIso = fechaViaje.toISOString();
    const { data: globalDuplicate } = await supabase
      .from('viajes')
      .select('id')
      .eq('tipo', tipo)
      .eq('zona_comun', zona_comun)
      .eq('fecha_hora', fechaIso)
      .eq('activo', true);

    if (globalDuplicate && globalDuplicate.length > 0) {
      return res.status(409).json({
        error: 'Ya existe un viaje en esa zona a esa misma hora. Buscalo en la lista y unite.'
      });
    }

    const { data: viaje, error } = await supabase
      .from('viajes')
      .insert({
        id_creador:        req.user.id,
        tipo,
        zona_comun,
        barrio:            barrio.trim(),
        fecha_hora:        fechaViaje.toISOString(),
        cupos_disponibles: 3
      })
      .select(`
        id, tipo, zona_comun, barrio, fecha_hora, cupos_disponibles, activo, created_at,
        profiles:id_creador ( id, nombre, apellido, rating_promedio )
      `)
      .single();

    if (error) throw error;

    res.status(201).json(viaje);
  } catch (err) {
    console.error('Create trip error:', err);
    res.status(500).json({ error: 'Error al crear el viaje.' });
  }
});

// ─── GET /api/trips/:id ──────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: viaje, error } = await supabase
      .from('viajes')
      .select(`
        id, tipo, zona_comun, barrio, fecha_hora, cupos_disponibles, activo, created_at,
        profiles:id_creador ( id, nombre, apellido, rating_promedio )
      `)
      .eq('id', id)
      .single();

    if (error || !viaje) {
      return res.status(404).json({ error: 'Viaje no encontrado.' });
    }

    // Obtener participantes — WhatsApp solo visible si el usuario pagó o es el creador
    const { data: participantes } = await supabase
      .from('participantes')
      .select(`
        id, estado_pago, created_at,
        profiles:id_usuario ( id, nombre, apellido, rating_promedio, whatsapp )
      `)
      .eq('id_viaje', id)
      .eq('estado_pago', true);

    const esCreador  = viaje.profiles.id === req.user.id;
    const esPasajero = participantes?.some(p => p.profiles.id === req.user.id);
    const puedeVerWA = esCreador || esPasajero;

    const participantesPublicos = (participantes || []).map(p => ({
      id:             p.id,
      estado_pago:    p.estado_pago,
      nombre:         p.profiles.nombre,
      apellido:       p.profiles.apellido,
      rating_promedio: p.profiles.rating_promedio,
      whatsapp:       puedeVerWA ? p.profiles.whatsapp : null,
      id_usuario:     p.profiles.id
    }));

    // Agregar creador a la lista de contactos si el user puede ver
    const creadorPublico = {
      id_usuario:     viaje.profiles.id,
      nombre:         viaje.profiles.nombre,
      apellido:       viaje.profiles.apellido,
      rating_promedio: viaje.profiles.rating_promedio,
      whatsapp:       puedeVerWA ? null : null, // WhatsApp del creador: fetch por separado si es necesario
      es_creador:     true
    };

    if (puedeVerWA) {
      // Fetch WhatsApp del creador
      const { data: creadorData } = await supabase
        .from('profiles')
        .select('whatsapp')
        .eq('id', viaje.profiles.id)
        .single();
      if (creadorData) creadorPublico.whatsapp = creadorData.whatsapp;
    }

    // ¿Puede unirse el usuario? (no es creador, no está ya, hay cupos)
    const yaEsPasajero = participantes?.some(p => p.profiles.id === req.user.id);

    res.json({
      ...viaje,
      participantes:   participantesPublicos,
      creador_detalle: creadorPublico,
      puede_unirse:    !esCreador && !yaEsPasajero && viaje.cupos_disponibles > 0 && viaje.activo,
      es_creador:      esCreador,
      ya_es_pasajero:  yaEsPasajero
    });

  } catch (err) {
    console.error('Get trip error:', err);
    res.status(500).json({ error: 'Error al obtener el viaje.' });
  }
});

// ─── POST /api/trips/:id/join ────────────────────────────────────────────────
router.post('/:id/join', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: viaje, error: viajeError } = await supabase
      .from('viajes')
      .select('id, id_creador, cupos_disponibles, activo, fecha_hora')
      .eq('id', id)
      .single();

    if (viajeError || !viaje) return res.status(404).json({ error: 'Viaje no encontrado.' });
    if (viaje.id_creador === req.user.id) return res.status(400).json({ error: 'No podés unirte a tu propio viaje.' });
    if (!viaje.activo) return res.status(400).json({ error: 'Este viaje ya no está activo.' });
    if (viaje.cupos_disponibles <= 0) return res.status(400).json({ error: 'No hay cupos disponibles.' });
    if (new Date(viaje.fecha_hora) <= new Date()) return res.status(400).json({ error: 'Este viaje ya pasó.' });

    const { data: existente } = await supabase
      .from('participantes')
      .select('id, estado_pago')
      .eq('id_viaje', id)
      .eq('id_usuario', req.user.id)
      .single();

    if (existente?.estado_pago) return res.status(409).json({ error: 'Ya sos parte de este viaje.' });

    if (existente) {
      await supabase.from('participantes').update({ estado_pago: true }).eq('id', existente.id);
    } else {
      await supabase.from('participantes').insert({
        id_viaje: id,
        id_usuario: req.user.id,
        estado_pago: true
      });
    }

    await supabase
      .from('viajes')
      .update({ cupos_disponibles: viaje.cupos_disponibles - 1 })
      .eq('id', id);

    res.json({ joined: true });
  } catch (err) {
    console.error('Join trip error:', err);
    res.status(500).json({ error: 'Error al unirte al viaje.' });
  }
});

// ─── DELETE /api/trips/:id/leave ─────────────────────────────────────────────
// El pasajero sale del viaje (sin reembolso)
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: participante, error } = await supabase
      .from('participantes')
      .select('id, estado_pago')
      .eq('id_viaje', id)
      .eq('id_usuario', req.user.id)
      .single();

    if (error || !participante) {
      return res.status(404).json({ error: 'No estás en este viaje.' });
    }

    // Eliminar participante
    await supabase
      .from('participantes')
      .delete()
      .eq('id', participante.id);

    // Si había pagado, liberar el cupo
    if (participante.estado_pago) {
      await supabase.rpc('increment_cupos', { viaje_id: id });
    }

    res.json({ message: 'Saliste del viaje. El servicio no es reembolsable.' });
  } catch (err) {
    console.error('Leave trip error:', err);
    res.status(500).json({ error: 'Error al salir del viaje.' });
  }
});

// ─── DELETE /api/trips/:id ───────────────────────────────────────────────────
// El creador cancela el viaje
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: viaje, error } = await supabase
      .from('viajes')
      .select('id, id_creador, fecha_hora')
      .eq('id', id)
      .single();

    if (error || !viaje) {
      return res.status(404).json({ error: 'Viaje no encontrado.' });
    }

    if (viaje.id_creador !== req.user.id) {
      return res.status(403).json({ error: 'Solo el creador puede cancelar el viaje.' });
    }

    // Marcar como inactivo (soft delete)
    await supabase
      .from('viajes')
      .update({ activo: false })
      .eq('id', id);

    res.json({ message: 'Viaje cancelado.' });
  } catch (err) {
    console.error('Delete trip error:', err);
    res.status(500).json({ error: 'Error al cancelar el viaje.' });
  }
});

// ─── GET /api/trips/my/created ───────────────────────────────────────────────
router.get('/my/created', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('viajes')
      .select('id, tipo, zona_comun, barrio, fecha_hora, cupos_disponibles, activo, created_at')
      .eq('id_creador', req.user.id)
      .order('fecha_hora', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Get my trips error:', err);
    res.status(500).json({ error: 'Error al obtener tus viajes.' });
  }
});

// ─── GET /api/trips/my/joined ────────────────────────────────────────────────
router.get('/my/joined', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('participantes')
      .select(`
        id, estado_pago, created_at,
        viajes:id_viaje ( id, tipo, zona_comun, barrio, fecha_hora, cupos_disponibles, activo,
          profiles:id_creador ( nombre, apellido, rating_promedio )
        )
      `)
      .eq('id_usuario', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Get joined trips error:', err);
    res.status(500).json({ error: 'Error al obtener los viajes.' });
  }
});

module.exports = router;
