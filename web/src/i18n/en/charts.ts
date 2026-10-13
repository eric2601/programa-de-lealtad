/** Gráficas del panel (src/admin/charts.tsx): lecturas en palabras, tooltips, etiquetas de eje. */
export const charts: Record<string, string> = {
  // Formatos compactos de eje y porcentajes
  '{n} M': '{n}M',
  '{n} mil': '{n}K',
  '{n} %': '{n}%',
  // Lecturas en palabras
  'Todavía no hay {noun} en el periodo.': 'No {noun} in this period yet.',
  'El mejor día fue el {day} con {best}; el promedio diario es {avg}; hoy lleva {today} y el día no ha terminado.': 'The best day was {day} with {best}; the daily average is {avg}; today is at {today} so far and the day is not over.',
  'El mejor día fue el {day} con {best}; el promedio diario es {avg}; el último día cerró en {last} ({change} frente al anterior).': 'The best day was {day} with {best}; the daily average is {avg}; the last day closed at {last} ({change} vs. the day before).',
  'El mejor día fue el {day} con {best}; el promedio diario es {avg}; el último día cerró en {last}.': 'The best day was {day} with {best}; the daily average is {avg}; the last day closed at {last}.',
  'El mejor día fue el {day} con {best}; el promedio diario es {avg}.': 'The best day was {day} with {best}; the daily average is {avg}.',
  'Sin {noun} en el periodo.': 'No {noun} in this period.',
  '{top} concentra todo ({value}).': '{top} accounts for all of it ({value}).',
  '{top} va primero con {value} ({share} % del total), {ratio} veces más que {last}, que va al final con {lastValue}.': '{top} leads with {value} ({share}% of the total), {ratio} times more than {last}, which is last with {lastValue}.',
  '{top} va primero con {value} ({share} % del total); {last} va al final con {lastValue}.': '{top} leads with {value} ({share}% of the total); {last} is last with {lastValue}.',
  'Sin movimientos en el periodo.': 'No activity in this period.',
  // Marco, tabla y tooltip
  'Ver los números': 'See the numbers',
  'Día': 'Day',
  'Todavía no hay datos en este periodo.': 'No data for this period yet.',
  '{title} · hoy, en curso': '{title} · today, in progress',
  'mejor día · {value}': 'best day · {value}',
  'hoy · {value}': 'today · {value}',
  'hoy': 'today',
  'hoy, en curso': 'today, in progress',
  'Valor': 'Value',
  '· {n} % del total': '· {n}% of total',
  // Sparkbars
  'Sin usos registrados.': 'No uses recorded.',
  'Usos por día; el mejor fue el {day} con {value}': 'Uses per day; the best was {day} with {value}',
};
