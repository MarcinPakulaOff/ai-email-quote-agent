// @inline thread
// Input: every message of the thread (Gmail thread:get, format=full). Output: one item for the rest of the flow.
const messages = $input.all().map((x) => x.json);
const T = $('Gmail Trigger').first().json; // reply metadata from the message that triggered the run
const from = parseFrom(T.from || T.From || T.headers?.from);
const zalaczniki = pickAttachments(messages);
return [{ json: {
  messageId: T.id,
  threadId: T.threadId,
  temat: T.subject || T.Subject || T.headers?.subject || '(brak tematu)',
  nadawca: from.display,
  nadawcaEmail: from.email,
  zalaczniki,
  maRysunki: zalaczniki.length > 0,
  liczbaWiadomosci: messages.length,
  tresc: buildTranscript(messages) || T.snippet || '(brak treści)',
} }];
