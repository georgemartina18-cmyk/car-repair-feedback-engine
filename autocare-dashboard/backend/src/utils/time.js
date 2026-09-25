/**
 * Date helpers that work in the business time zone (config.TIMEZONE),
 * whatever time zone the server itself is set to.
 */

/** Calendar parts ({ year, month, day, hour, minute, weekday }) of `date` in time zone `tz`. */
function partsInTz(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: p.year,
    month: p.month,
    day: p.day,
    hour: p.hour,
    minute: p.minute,
    second: p.second,
  };
}

/** 'YYYY-MM-DD' for `date` in time zone `tz`. */
function dateStrInTz(date, tz) {
  const p = partsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'YYYY-MM-DD HH:MM' for `date` in time zone `tz`. */
function dateTimeStrInTz(date, tz) {
  const p = partsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** How far `tz` is ahead of UTC at `date`, in milliseconds. */
function tzOffsetMs(date, tz) {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC moment when local day 'YYYY-MM-DD' starts (00:00) in `tz`. */
function startOfDayUtc(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - tzOffsetMs(guess, tz));
}

/** Add `days` to a 'YYYY-MM-DD' string. */
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week that contains 'YYYY-MM-DD'. */
function startOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -((weekday + 6) % 7));
}

module.exports = { partsInTz, dateStrInTz, dateTimeStrInTz, startOfDayUtc, addDays, startOfWeek };
