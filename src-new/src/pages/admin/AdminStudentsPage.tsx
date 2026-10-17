import React from 'react';
import { ELEV_ROLES } from '../../lib/accounts';
import { AdminAccountsView } from './AdminAccountsView';

interface Props {
  onNavigate: (pageId: string) => void;
}

/**
 * Elever. Här ser administratören alla elevkonton, kan söka och filtrera, öppna
 * en elevs uppgifter, byta namn, aktivera eller inaktivera kontot, sätta ett
 * nytt tillfälligt lösenord och hantera klasskopplingar.
 *
 * Rollen kan inte ändras härifrån: att göra en elev till personal är ett beslut
 * som hör till Roller och behörigheter (och loggas där).
 */
export const AdminStudentsPage: React.FC<Props> = ({ onNavigate }) => (
  <AdminAccountsView
    testId="page-admin-elever"
    title="Elever"
    subtitle="Elevkonton med klasskopplingar och status"
    roles={ELEV_ROLES}
    showAccountType
    showClasses
    createPage="create-user"
    createLabel="Skapa elevkonto"
    emptyTitle="Inga elevkonton ännu"
    emptyDescription="Skapa ett elevkonto, eller låt eleverna komma in via registreringen. Nya konton visas här direkt."
    onNavigate={onNavigate}
  />
);
