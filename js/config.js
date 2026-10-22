/* js/config.js — constantes de negocio centralizadas. Cargar ANTES que las vistas en index.html */
const THRESHOLDS = {
  CRITICO: 4.30,     // sucursal en estado crítico
  BAJO: 4.60,        // bajo desempeño / umbral regional objetivo
  EXCELENTE: 4.80,   // desempeño sobresaliente
  DOWN: 4.50         // indicador visual "a la baja" en tarjetas de trimestre
};

/* Cliente de esta instalación. Étoile es el producto; el cliente aparece solo como nombre (barra, reportes, pies) */
const CLIENTE = {
  nombre: 'La Crêpe Parisienne', grupo: 'Grupo MYT',
  // Aviso de privacidad del portal: el cliente es el responsable del tratamiento de los datos de sus colaboradores
  responsable: 'La Crêpe Parisienne S.A. de C.V.', domicilio: 'las oficinas del Corporativo Alancar', privacidad: 'privacidad@lcp.com.mx'
};

const NEGATIVE_STARS_MAX = 2; // reseña cuenta como queja/alerta si stars <= este valor

const COMPLAINT_KEYWORDS = {
  servicio: ["servicio", "atencion", "mesero", "meser", "cajero", "cajer", "tarde", "tard", "espera", "esper", "demora", "demor", "trato", "grosero", "groser", "actitud", "limpieza", "limp", "sucio", "fila", "caja", "personal", "mal servicio", "lento", "tade", "tardaron", "amabilidad"],
  calidad: ["comida", "crepa", "ingrediente", "fria", "frio", "quema", "sabor", "malo", "rancio", "pelo", "mosca", "insipido", "calidad", "cruda", "crudo", "queso", "massa", "masa"],
  valor: ["caro", "precio", "costo", "porcion", "tamaño", "chico", "diminuto", "estafa", "robo", "carisimo", "abusivo", "cantidad"]
};

const NEGATION_WORDS = ["no", "nunca", "tampoco", "nada", "sin", "jamas", "ningun", "ninguna"];

function classifyReviewCategory(text, categoryKeywords) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  return categoryKeywords.some(kw => {
    const kwIndex = clean.indexOf(kw);
    if (kwIndex === -1) return false;
    
    // Extraer las palabras inmediatamente anteriores a la palabra clave
    const textBefore = clean.substring(Math.max(0, kwIndex - 30), kwIndex).trim().split(/\s+/);
    const recentWords = textBefore.slice(-3);
    const isNegated = recentWords.some(w => NEGATION_WORDS.includes(w));
    return !isNegated;
  });
}


