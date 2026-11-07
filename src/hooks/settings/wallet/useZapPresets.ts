import { useForm } from '@/hooks/common/useForm';
import { zapPresetsForm } from '@/services/preferences/zap-presets-form';

export function useZapPresets() {
  const form = useForm(zapPresetsForm());
  const change = (index: number, field: 'emoji' | 'amountSats', value: string) => {
    form.set('presets', form.values.presets.map((p, i) => i !== index ? p
      : { ...p, [field]: field === 'amountSats' ? Number(value) : value }));
  };
  return {
    form, change,
    add: () => form.set('presets', [...form.values.presets, { emoji: '', amountSats: 21 }]),
    remove: (index: number) => form.set('presets', form.values.presets.filter((_, i) => i !== index)),
  };
}
