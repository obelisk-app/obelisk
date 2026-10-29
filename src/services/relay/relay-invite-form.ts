import type { FormSpec } from '@/types/common/form';
import type { RelayInviteCode } from '@/types/relay/relay-invite';
import { inviteCreateRequest, type InviteFormLimits, type InviteFormValues } from '@/utils/relay/relay-invite-panel';
import { createInviteCode } from './relay-invite-api';

const PROBLEM_KEY = {
  label: 'settings.invites.form.labelTooLong',
  people: 'settings.invites.form.peopleRange',
  days: 'settings.invites.form.daysRange',
} as const;

/**
 * Settings > Invite people, "Create link": an optional label only the
 * creator sees, how many people may use it (1 up to what is left of the
 * allowance, all of it by default) and how many days it lasts (7 by default,
 * up to the allowance's longest). The relay clamps again on its side.
 */
export function relayInviteCreateForm(
  relay: string,
  limits: InviteFormLimits,
  onCreated: (invite: RelayInviteCode) => void,
): FormSpec<InviteFormValues, RelayInviteCode> {
  return {
    initial: { label: '', people: String(limits.maxPeople), days: String(limits.defaultDays) },
    validate: (values) => {
      const request = inviteCreateRequest(values, limits);
      return request.ok ? null : PROBLEM_KEY[request.problem];
    },
    submit: (values) => {
      const request = inviteCreateRequest(values, limits);
      return createInviteCode(relay, request.ok ? request.options : {});
    },
    failure: 'settings.invites.failed',
    onSuccess: (invite) => onCreated(invite),
  };
}
