// @inline format
return [{ json: { akcja: classification($json.output?.[0]?.content?.[0]?.text) } }];
