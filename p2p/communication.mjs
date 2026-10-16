export const CONTACT_KINDS = ['messages', 'voiceCalls', 'videoCalls'];
export const communication = value => Object.fromEntries(CONTACT_KINDS.map(kind => [kind, value?.[kind] !== false]));
export function contactUpdate(previous, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([key, enabled]) => !CONTACT_KINDS.includes(key) || typeof enabled !== 'boolean')) throw new Error('Invalid contact permissions');
  return { ...communication(previous), ...value };
}
export const callKind = data => data?.video || /^m=video [1-9]\d* /m.test(String(data?.sdp?.sdp || '')) ? 'videoCalls' : 'voiceCalls';
export const contactError = kind => Object.assign(new Error(`This friend isn’t accepting ${kind === 'messages' ? 'direct messages' : kind === 'videoCalls' ? 'video calls' : 'voice calls'} from you.`), { code: 'COMMUNICATION_DENIED' });
