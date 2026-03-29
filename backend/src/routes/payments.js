const express  = require('express');
const supabase = require('../db');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const router = express.Router();

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// ─── POST /api/payments/webhook ──────────────────────────────────────────────
// MercadoPago llama a este endpoint cuando el estado de un pago cambia
router.post('/webhook', async (req, res) => {
  try {
    // MP puede enviar el body como JSON o como raw bytes
    let body;
    if (Buffer.isBuffer(req.body)) {
      body = JSON.parse(req.body.toString());
    } else {
      body = req.body;
    }

    const { type, data } = body;

    // Solo nos interesan los eventos de pago
    if (type !== 'payment') {
      return res.sendStatus(200);
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return res.sendStatus(200);
    }

    // Obtener detalles del pago desde la API de MP
    const paymentClient = new Payment(mpClient);
    const payment = await paymentClient.get({ id: paymentId });

    if (!payment || payment.status !== 'approved') {
      return res.sendStatus(200);
    }

    // external_reference format: "id_viaje:id_usuario"
    const externalRef = payment.external_reference;
    if (!externalRef || !externalRef.includes(':')) {
      console.error('Webhook: external_reference inválido:', externalRef);
      return res.sendStatus(200);
    }

    const [id_viaje, id_usuario] = externalRef.split(':');

    // Verificar que el participante existe
    const { data: participante, error: pError } = await supabase
      .from('participantes')
      .select('id, estado_pago')
      .eq('id_viaje', id_viaje)
      .eq('id_usuario', id_usuario)
      .single();

    if (pError || !participante) {
      console.error('Webhook: participante no encontrado para', externalRef);
      return res.sendStatus(200);
    }

    // Si ya está pagado, ignorar (idempotencia)
    if (participante.estado_pago) {
      return res.sendStatus(200);
    }

    // Actualizar estado del participante
    await supabase
      .from('participantes')
      .update({
        estado_pago:   true,
        mp_payment_id: String(paymentId)
      })
      .eq('id', participante.id);

    // Decrementar cupos disponibles del viaje
    const { data: viaje } = await supabase
      .from('viajes')
      .select('cupos_disponibles')
      .eq('id', id_viaje)
      .single();

    if (viaje && viaje.cupos_disponibles > 0) {
      await supabase
        .from('viajes')
        .update({ cupos_disponibles: viaje.cupos_disponibles - 1 })
        .eq('id', id_viaje);
    }

    console.log(`✅ Pago confirmado: viaje=${id_viaje}, usuario=${id_usuario}, payment=${paymentId}`);
    res.sendStatus(200);

  } catch (err) {
    console.error('Webhook error:', err);
    // Siempre devolver 200 para que MP no reintente
    res.sendStatus(200);
  }
});

// ─── GET /api/payments/status ────────────────────────────────────────────────
// El frontend consulta si el pago fue acreditado (pollingdespués del redirect)
router.get('/status', async (req, res) => {
  try {
    const { payment_id, external_reference } = req.query;

    if (!external_reference) {
      return res.status(400).json({ error: 'external_reference requerido.' });
    }

    const [id_viaje, id_usuario] = external_reference.split(':');

    const { data: participante } = await supabase
      .from('participantes')
      .select('estado_pago, mp_payment_id')
      .eq('id_viaje', id_viaje)
      .eq('id_usuario', id_usuario)
      .single();

    if (!participante) {
      return res.json({ paid: false, message: 'Pago pendiente de confirmación.' });
    }

    res.json({
      paid:           participante.estado_pago,
      mp_payment_id:  participante.mp_payment_id,
      id_viaje,
      message: participante.estado_pago
        ? '✅ ¡Pago confirmado! Ya sos parte del viaje.'
        : '⏳ Pago pendiente de acreditación.'
    });

  } catch (err) {
    console.error('Payment status error:', err);
    res.status(500).json({ error: 'Error al verificar el pago.' });
  }
});

module.exports = router;
