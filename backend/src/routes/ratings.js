const express  = require('express');
const supabase = require('../db');
const auth     = require('../middleware/auth');

const router = express.Router();

// ─── POST /api/ratings ───────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { id_viaje, id_calificado, puntuacion } = req.body;

    if (!id_viaje || !id_calificado || !puntuacion) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (puntuacion < 1 || puntuacion > 5 || !Number.isInteger(puntuacion)) {
      return res.status(400).json({ error: 'La puntuación debe ser 1, 2, 3, 4 o 5.' });
    }

    if (id_calificado === req.user.id) {
      return res.status(400).json({ error: 'No podés calificarte a vos mismo.' });
    }

    // Verificar que el viaje existe y ya pasó (mínimo 2 hs después)
    const { data: viaje, error: vError } = await supabase
      .from('viajes')
      .select('id, fecha_hora, id_creador')
      .eq('id', id_viaje)
      .single();

    if (vError || !viaje) {
      return res.status(404).json({ error: 'Viaje no encontrado.' });
    }

    const dosPlusHoras = new Date(viaje.fecha_hora);
    dosPlusHoras.setHours(dosPlusHoras.getHours() + 2);

    if (new Date() < dosPlusHoras) {
      return res.status(400).json({
        error: 'Solo podés calificar 2 horas después del horario de salida.'
      });
    }

    // Verificar que el calificador participó (como creador o pasajero pagado)
    const esCreador = viaje.id_creador === req.user.id;

    let participoCalificador = esCreador;
    if (!esCreador) {
      const { data: partCalif } = await supabase
        .from('participantes')
        .select('id')
        .eq('id_viaje', id_viaje)
        .eq('id_usuario', req.user.id)
        .eq('estado_pago', true)
        .single();
      participoCalificador = !!partCalif;
    }

    if (!participoCalificador) {
      return res.status(403).json({ error: 'Solo pueden calificar quienes participaron del viaje.' });
    }

    // Verificar que el calificado también participó
    const esCalificadoCreador = viaje.id_creador === id_calificado;
    let participoCalificado = esCalificadoCreador;

    if (!esCalificadoCreador) {
      const { data: partCalif2 } = await supabase
        .from('participantes')
        .select('id')
        .eq('id_viaje', id_viaje)
        .eq('id_usuario', id_calificado)
        .eq('estado_pago', true)
        .single();
      participoCalificado = !!partCalif2;
    }

    if (!participoCalificado) {
      return res.status(400).json({ error: 'El usuario calificado no participó del viaje.' });
    }

    // Insertar rating (el UNIQUE constraint evita duplicados)
    const { data: rating, error: rError } = await supabase
      .from('ratings')
      .insert({
        id_viaje,
        id_calificador: req.user.id,
        id_calificado,
        puntuacion
      })
      .select()
      .single();

    if (rError) {
      if (rError.code === '23505') {
        return res.status(409).json({ error: 'Ya calificaste a este usuario en este viaje.' });
      }
      throw rError;
    }

    // Recalcular el rating promedio del usuario calificado
    const { data: allRatings } = await supabase
      .from('ratings')
      .select('puntuacion')
      .eq('id_calificado', id_calificado);

    if (allRatings && allRatings.length > 0) {
      const total   = allRatings.reduce((sum, r) => sum + r.puntuacion, 0);
      const promedio = +(total / allRatings.length).toFixed(2);

      await supabase
        .from('profiles')
        .update({
          rating_promedio: promedio,
          rating_count:    allRatings.length
        })
        .eq('id', id_calificado);

      // Suspender si el rating baja de 3 con al menos 5 calificaciones
      if (promedio < 3 && allRatings.length >= 5) {
        console.warn(`⚠️ Usuario ${id_calificado} tiene rating ${promedio} — revisar suspensión.`);
      }
    }

    res.status(201).json({ message: '¡Calificación enviada!', rating });

  } catch (err) {
    console.error('Rating error:', err);
    res.status(500).json({ error: 'Error al enviar la calificación.' });
  }
});

// ─── GET /api/ratings/pending ────────────────────────────────────────────────
// Viajes donde el usuario puede calificar (2hs después y aún no calificó a alguien)
router.get('/pending', auth, async (req, res) => {
  try {
    const now = new Date();
    const dosHorasAtras = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Viajes donde participé (como creador o pasajero pagado) y ya pasaron 2hs
    const { data: creados } = await supabase
      .from('viajes')
      .select('id, tipo, zona_comun, barrio, fecha_hora')
      .eq('id_creador', req.user.id)
      .lte('fecha_hora', dosHorasAtras.toISOString())
      .eq('activo', true);

    const { data: unido } = await supabase
      .from('participantes')
      .select('id_viaje, viajes:id_viaje ( id, tipo, zona_comun, barrio, fecha_hora )')
      .eq('id_usuario', req.user.id)
      .eq('estado_pago', true);

    const viajesUnido = (unido || [])
      .map(p => p.viajes)
      .filter(v => v && new Date(v.fecha_hora) <= dosHorasAtras);

    const todosLosViajes = [...(creados || []), ...viajesUnido];

    // Filtrar los que ya calificó completamente
    const pendientes = [];

    for (const viaje of todosLosViajes) {
      const { data: participantes } = await supabase
        .from('participantes')
        .select('id_usuario')
        .eq('id_viaje', viaje.id)
        .eq('estado_pago', true);

      const { data: creadorData } = await supabase
        .from('viajes')
        .select('id_creador')
        .eq('id', viaje.id)
        .single();

      const todos = [
        creadorData?.id_creador,
        ...(participantes || []).map(p => p.id_usuario)
      ].filter(id => id && id !== req.user.id);

      const { data: yaCalifique } = await supabase
        .from('ratings')
        .select('id_calificado')
        .eq('id_viaje', viaje.id)
        .eq('id_calificador', req.user.id);

      const calificados = (yaCalifique || []).map(r => r.id_calificado);
      const sinCalificar = todos.filter(id => !calificados.includes(id));

      if (sinCalificar.length > 0) {
        // Obtener nombres de quienes falta calificar
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nombre, apellido')
          .in('id', sinCalificar);

        pendientes.push({ viaje, sinCalificar: profiles || [] });
      }
    }

    res.json(pendientes);
  } catch (err) {
    console.error('Pending ratings error:', err);
    res.status(500).json({ error: 'Error al obtener las calificaciones pendientes.' });
  }
});

module.exports = router;
