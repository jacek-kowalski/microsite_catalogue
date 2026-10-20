// Host mock for the click-to-email microsite. On a TV the ad player answers
// the microsite's postMessage requests; here we play that role so the full
// flow (CTA → confirm popup → "sent" toast) works in the browser.
//
// Protocol (templates/click-to-email/examples/default/index.html):
//   page → host  '{"getSsoState":""}'                       on load
//   host → page  {type:'ssoState', bLogin, maskedEmail}     accepted only in step 0
//   page → host  '{"sendEmail":{"flightId":n,"creativeId":n}}'
//   host → page  {type:'sendEmailResult', ok, error?}       within 30 s
// The page only accepts messages whose source is its parent window, which
// is this catalogue page.

const MASKED_EMAIL = 'j***@example.com';
const SEND_DELAY_MS = 1200;

export function attach(iframe) {
    function reply(msg) {
        if (iframe.contentWindow) { iframe.contentWindow.postMessage(msg, '*'); }
    }
    function onMessage(event) {
        if (event.source !== iframe.contentWindow) { return; }
        let data = event.data;
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch (e) { return; }
        }
        if (!data || typeof data !== 'object') { return; }
        if ('getSsoState' in data) {
            reply({ type: 'ssoState', bLogin: true, maskedEmail: MASKED_EMAIL });
        } else if ('sendEmail' in data) {
            setTimeout(() => reply({ type: 'sendEmailResult', ok: true }), SEND_DELAY_MS);
        }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
}
