import Text from '@/components/ui/layout/Text';
import List from '@/components/ui/layout/List';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Section from '@/components/ui/layout/Section';

/** Do and don't for the brand. */
export function GuidelinesSection() {
  const t = useTranslations();
  return (
    <Section
      id="guidelines"
      title={t('mediaKit.guidelines')}
      description={t('mediaKit.desc.guidelines')}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card variant="interactive" padding="xl">
          <div className="text-lc-green font-semibold mb-2">{t('mediaKit.do')}</div>
          <List marker="inside" spacing="tight" className="text-sm text-lc-white">
            <Text as="li">
              {t('mediaKit.rule.dark')}
            </Text>
            <Text as="li">{t('mediaKit.rule.clearSpace')}</Text>
            <Text as="li">
              {t('mediaKit.rule.green')}
            </Text>
            <Text as="li">
              {t('mediaKit.rule.capital')}
            </Text>
          </List>
        </Card>
        <Card variant="interactive" padding="xl">
          <div className="text-red-400 font-semibold mb-2">{t('mediaKit.dont')}</div>
          <List marker="inside" spacing="tight" className="text-sm text-lc-white">
            <Text as="li">{t('mediaKit.rule.noSkew')}</Text>
            <Text as="li">
              {t('mediaKit.rule.noColors')}
            </Text>
            <Text as="li">{t('mediaKit.rule.lowContrast')}</Text>
            <Text as="li">
              {t('mediaKit.rule.noEffects')}
            </Text>
          </List>
        </Card>
      </div>
    </Section>
  );
}
