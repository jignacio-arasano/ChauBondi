import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import TripCard from '../components/TripCard';

const ZONAS = [
  'Patio Olmos Shopping (Entrada principal) - Barrio Centro / Nueva Córdoba',
  'Paseo del Buen Pastor (Frente a la fuente) - Barrio Nueva Córdoba',
  'Plaza España (Ingreso al Museo Metropolitano) - Barrio Nueva Córdoba',
  'Plaza San Martín (Frente a la Catedral) - Barrio Centro',
  'Nuevocentro Shopping (Entrada principal sobre Av. Duarte Quirós) - Barrio Alberdi',
  'Plaza Colón (Sobre Av. Colón) - Barrio Alberdi',
  'Plaza Alberdi (Sobre Av. 24 de Septiembre) - Barrio General Paz',
  'Plaza Rivadavia (Frente al Centro Cultural) - Barrio Alta Córdoba',
  'Paseo del Jockey (Entrada sobre calle Elías Yofre) - Barrio Jardín',
  'Córdoba Shopping (Entrada principal sobre calle José de Goyechea) - Barrio Villa Cabrera',
  'Mujer Urbana (Nudo vial frente a los locales gastronómicos) - Barrio Cerro de las Rosas',
  'Dino Mall Alto Verde (Entrada principal sobre Av. Rodríguez del Busto) - Barrio Alto Verde',
  'Plaza Jerónimo del Barco (Sobre Av. Colón) - Barrio Alto Alberdi',
  'Terminal de Ómnibus T2 (Nueva Terminal, sector de informes) - Barrio Centro / Juniors',
  'Parque de las Naciones (Ingreso principal sobre calle Mariano Larra) - Barrio Urca / Cerro',
  'Palacio 6 de Julio (Explanada de la Municipalidad) - Barrio Centro',
  'Plaza de la Intendencia (Frente a Tribunales I) - Barrio Centro',
  'Paseo Rivera Indarte (Entrada principal del centro comercial) - Barrio Villa Rivera Indarte',
];

export default function Search() {
  const [searchParams] = useSearchParams();

  const [tipo,    setTipo]    = useState(searchParams.get('tipo') || '');
  const [zona,    setZona]    = useState('');
  const [fecha,   setFecha]   = useState('');
  const [trips,   setTrips]   = useState([]);
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(async (t, z, f) => {
    setLoading(true);
    try {
      const params = {};
      if (t) params.tipo  = t;
      if (z) params.zona  = z;
      if (f) params.fecha = f;
      const data = await api.trips.list(params);
      setTrips(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Buscar automáticamente cada vez que cambia cualquier filtro
  useEffect(() => {
    buscar(tipo, zona, fecha);
  }, [tipo, zona, fecha, buscar]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="page">
      {/* Header */}
      <div style={{
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        padding: '48px 24px 20px',
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <h2 style={{ marginBottom: 16, fontSize: '1.2rem', letterSpacing: '0.05em' }}>BUSCAR VIAJES</h2>

          {/* Tipo */}
          <div className="segment" style={{ marginBottom: 12 }}>
            <button
              className={`segment-btn ${tipo === 'IDA' ? 'active' : ''}`}
              onClick={() => setTipo('IDA')}
            >🎓 Al Campus</button>
            <button
              className={`segment-btn ${tipo === '' ? 'active' : ''}`}
              onClick={() => setTipo('')}
            >Todos</button>
            <button
              className={`segment-btn ${tipo === 'VUELTA' ? 'active' : ''}`}
              onClick={() => setTipo('VUELTA')}
            >🏠 A casa</button>
          </div>

          {/* Zona */}
          <select
            className="input"
            value={zona}
            onChange={e => setZona(e.target.value)}
            style={{ marginBottom: 10, fontSize: '0.9rem' }}
          >
            <option value="">📍 Todas las zonas</option>
            {ZONAS.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>

          {/* Fecha */}
          <input
            className="input"
            type="date"
            value={fecha}
            min={today}
            onChange={e => setFecha(e.target.value)}
            style={{ fontSize: '0.9rem', colorScheme: 'dark' }}
          />
        </div>
      </div>

      {/* Resultados */}
      <div className="container" style={{ paddingTop: 20 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner" />
          </div>
        ) : trips.length === 0 ? (
          <div className="empty-state">
            <div className="icon">😔</div>
            <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem' }}>SIN RESULTADOS</h3>
            <p>No hay viajes con esos filtros. ¡Publicá el tuyo!</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: 14 }}>
              {trips.length} viaje{trips.length !== 1 ? 's' : ''} disponible{trips.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {trips.map(t => <TripCard key={t.id} trip={t} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
