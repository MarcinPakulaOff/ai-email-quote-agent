// @inline vision
// @prompt vision
const meta = $('Rysunki — rozbij').all().map((x) => x.json);
return [{ json: buildVisionRequest(meta, $input.all().map((x) => x.json), PROMPT_VISION) }];
