import React from 'react';
import { ASSIGNABLE_ROLES } from '../../lib/auth-types';
import { AdminAccountsView } from './AdminAccountsView';

interface Props {
  onNavigate: (pageId: string) => void;
}

/**
 * Kontolistan med alla konton och de åtgärder administratören behöver: namn,
 * status, nytt tillfälligt lösenord och rollbyte. Rollbytet är den enda vägen
 * till administratörsrollen och sker via den skyddade serverfunktionen
 * `admin-users` (action: set-role) — aldrig genom att skapa ett konto.
 */
export const AdminAccountsPage: React.FC<Props> = ({ onNavigate }) => (
  <AdminAccountsView
    testId="page-admin-anvandare"
    title="Konton"
    subtitle="Alla konton som din roll får administrera"
    roles={ASSIGNABLE_ROLES}
    allowRoleChange
    createPage="create-user"
    createLabel="Skapa konto"
    emptyTitle="Inga konton hittades"
    emptyDescription="Det finns inga konton att visa ännu. Skapa det första kontot för att komma igång."
    onNavigate={onNavigate}
  />
);
