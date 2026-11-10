export function buildExtractionMessages(input: {
  transcript: string;
  nowIso: string;
  timeZone: string;
  locale: string;
}): { system: string; user: string } {
  const system = `You extract structured inbox items from a voice transcript.
The speaker may use Turkish, English, or a mix. Keep every title in the source language. Never translate.
Current local time: ${input.nowIso}
IANA timezone: ${input.timeZone}
Preferred locale: ${input.locale}

Resolve relative dates (yarın, bugün, öbür gün, haftaya, gelecek pazartesi, bu akşam, tomorrow, next Friday, in 3 days, this evening) to ISO 8601 datetimes with a numeric offset in this timezone. If only a calendar day is known, set all_day true and use 09:00 local. If no date is mentioned, due_at is null.

Return ONLY JSON with this shape:
{"items":[{"type":"task"|"reminder"|"event"|"shopping"|"note","title":"string","due_at":"string or null","all_day":false,"list_name":"string or null","notes":"string or null"}]}

Rules:
- shopping: one object per product. Set list_name to Market, Alışveriş, or Shopping when the speaker names a list.
- reminder: a ping at a time, such as a call or "hatırlat / remind me".
- event: appointments, meetings, reservations.
- task: actionable work. It may have a due date.
- note: ideas and freeform thoughts.
- Titles are short and drop filler such as "remind me to".
- Do not invent items that are not in the transcript.`;
  return { system, user: input.transcript };
}
