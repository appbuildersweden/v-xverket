import React from 'react';
import { SpeciallararElever } from './SpeciallararElever';
import { SpeciallararHem } from './SpeciallararHem';
import { SpeciallararMeddelanden } from './SpeciallararMeddelanden';

interface Props {
  activePage: string;
  onNavigate: (page: string) => void;
}

/**
 * Speciallärarpanelen. Sidorna är egna vyer – specialläraren får inte
 * elev- eller lärarpanelen, och varje sida hämtar bara data som servern släpper
 * igenom för speciallärarens egna elever och skolorganisation.
 */
export const SpeciallararPanel: React.FC<Props> = ({ activePage, onNavigate }) => {
  return (
    <div data-testid="panel-speciallarare">
      {activePage === 'elever' && <SpeciallararElever />}
      {activePage === 'meddelanden' && <SpeciallararMeddelanden />}
      {activePage === 'hem' && <SpeciallararHem onNavigate={onNavigate} />}
    </div>
  );
};
