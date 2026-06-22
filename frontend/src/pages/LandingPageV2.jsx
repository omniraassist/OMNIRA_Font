import { useEffect } from 'react';
import '../styles/global_v2.css';
import { Hero } from '../components/sections/Hero.jsx';
import { LogosMarquee } from '../components/sections/LogosMarquee.jsx';
import { ProblemSection } from '../components/sections/ProblemSection.jsx';
import { SolutionSection } from '../components/sections/SolutionSection.jsx';
import { BenefitsSection } from '../components/sections/BenefitsSection.jsx';
import { HowItWorksSection } from '../components/sections/HowItWorksSection.jsx';
import { CaseStudiesSection } from '../components/sections/CaseStudiesSection.jsx';
import { PricingSection } from '../components/sections/PricingSection.jsx';
import { FaqSection } from '../components/sections/FaqSection.jsx';
import { CtaFinalSection } from '../components/sections/CtaFinalSection.jsx';

export function LandingPageV2() {
  useEffect(() => {
    document.body.classList.add('landing-v2');
    return () => document.body.classList.remove('landing-v2');
  }, []);

  return (
    <>
      <Hero />
      <LogosMarquee />
      <ProblemSection />
      <div className="divider" />
      <SolutionSection />
      <div className="divider" />
      <BenefitsSection />
      <div className="divider" />
      <HowItWorksSection />
      <div className="divider" />
      <CaseStudiesSection />
      <div className="divider" />
      <PricingSection />
      <div className="divider" />
      <FaqSection />
      <div className="divider" />
      <CtaFinalSection />
    </>
  );
}
