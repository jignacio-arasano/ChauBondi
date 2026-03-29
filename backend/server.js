require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes    = require('./src/routes/auth');
const tripRoutes    = require('./src/routes/trips');
const paymentRoutes = require('./src/routes/payments');
const ratingRoutes  = require('./src/routes/ratings');

const app = express();
// ← AGREGAR ESTA LÍNEA (Railway corre detrás de un proxy)
app.set('trust proxy', 1);
// ─── Middlewares ────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Webhook de MercadoPago necesita el body raw para verificación
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Rate limiting general
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Rate limiting más estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos, esperá 15 minutos.' }
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/trips',    tripRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ratings',  ratingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Servir Frontend (build de React) ────────────────────────────────────────
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// SPA fallback — todas las rutas que no sean /api/* van al index.html
app.get(/^(?!\/api).*$/, (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Frontend no encontrado. ¿Corriste el build?' });
    }
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚌 ChauBondi server corriendo en puerto ${PORT}`);
  console.log(`   Modo: ${process.env.NODE_ENV || 'development'}`);
});
