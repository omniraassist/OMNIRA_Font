const ITEMS = [
  ['fa-solid fa-tooth', 'Clínicas Dentales'],
  ['fa-solid fa-spa', 'Centros de Estética'],
  ['fa-solid fa-person-running', 'Fisioterapeutas'],
  ['fa-solid fa-scissors', 'Peluquerías'],
  ['fa-solid fa-brain', 'Psicólogos'],
  ['fa-solid fa-dumbbell', 'Entrenadores'],
  ['fa-solid fa-eye', 'Clínicas Ópticas'],
  ['fa-solid fa-stethoscope', 'Consultas Médicas'],
  ['fa-solid fa-paw', 'Veterinarios'],
  ['fa-solid fa-hand-sparkles', 'Centros de Uñas'],
];

export function LogosMarquee() {
  const doubled = [...ITEMS, ...ITEMS];
  return (
    <div id="logos">
      <p className="logos-label">Sectores que automatizan con Omnira</p>
      <div className="marquee-wrap">
        <div className="marquee-track" id="marquee-track">
          {doubled.map(([icon, label], i) => (
            <div key={`${label}-${i}`} className="marquee-item">
              <i className={icon} /> {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
