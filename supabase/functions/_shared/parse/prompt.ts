export function buildExtractionMessages(input: {
  transcript: string;
  nowIso: string;
  utcOffset: string;
  timeZone: string;
  locale: string;
}): { system: string; user: string } {
  const locale = input.locale || 'en';
  const voice =
    locale === 'en' || locale === 'tr'
      ? 'The speaker may use Turkish, English, or a mix. Keep every title in the source language. Never translate.'
      : `Write titles, notes, and list names in the user's language (${locale}). Stay faithful to what was said. Keep a person's name as spoken.`;
  const system = `You extract structured inbox items from a voice transcript.
${voice}
Current local time: ${input.nowIso}
UTC offset: ${input.utcOffset}
IANA timezone: ${input.timeZone}
Preferred locale: ${locale}

Resolve relative dates (yarın, bugün, öbür gün, haftaya, gelecek pazartesi, bu akşam, tomorrow, next Friday, in 3 days, this evening) to ISO 8601 datetimes with a numeric offset in this timezone. If only a calendar day is known, set all_day true and use 09:00 local. If no date is mentioned, due_at is null.

Return ONLY JSON with this shape:
{"items":[{"type":"task"|"reminder"|"event"|"shopping"|"note","title":"string","due_at":"string or null","all_day":false,"list_name":"string or null","notes":"string or null"}]}

Rules:
- shopping: one object per product. Set list_name to the list the speaker names. If they only mention a generic shop, use Shopping for en, Alışveriş for tr, and the natural word for a shopping list in any other locale.
- reminder: a ping at a time, such as a call or "hatırlat / remind me".
- event: appointments, meetings, reservations.
- task: actionable work. It may have a due date.
- note: ideas and freeform thoughts.
- Titles are short and drop filler such as "remind me to".
- Do not invent items that are not in the transcript.`;
  return { system, user: input.transcript };
}
