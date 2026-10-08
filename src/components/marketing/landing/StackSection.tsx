import Link from '@/components/ui/navigation/Link';
import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import Row from '@/components/ui/layout/Row';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { TECH_STACK } from '@/constants/marketing/landing';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The tech stack cards, each linking out.
 */
export default function StackSection() {
  const t = useTranslations();
  return (
    <PageSection reveal id="stack">
      <Container width="6xl">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.stack.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.stack.subtitle')}
          </Text>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {TECH_STACK.map((tech) => (
            <Card variant="interactive" padding="xl" key={tech.name} asChild>
              <Link
                href={tech.href}
                target="_blank"
                variant="card" className="group"
              >
                <Row gap="3" align="center">
                  {tech.img ? (
                    <Image src={tech.img} alt={tech.name} width={40} height={40} className="w-10 h-10 rounded-lg shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-lc-olive/30 flex items-center justify-center text-sm shrink-0">
                      <span className={tech.color}>{tech.icon}</span>
                    </div>
                  )}
                  <div>
                    <Heading as="h3" className={`text-sm font-bold ${tech.color} group-hover:scale-105 transition-transform origin-left`}>
                      {tech.name}
                    </Heading>
                    <Text as="p" variant="caption">{t(tech.descKey)}</Text>
                  </div>
                </Row>
              </Link>
            </Card>
          ))}
        </div>
      </Container>
    </PageSection>
  );
}
