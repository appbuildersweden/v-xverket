import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { PERSONAL_ROLES } from '../../lib/accounts';
import { AdminAccountsView } from './AdminAccountsView';

interface Props {
  onNavigate: (pageId: string) => void;
  /** Visa bara speciallärare (sidan Speciallärare). */
  onlySpecialTeachers?: boolean;
}

/**
 * Personal. Här hanteras lärar-, speciallärar- och administratörskonton: namn,
 * status och nytt tillfälligt lösenord.
 *
 * Rollen ändras inte härifrån. Ett rollbyte — särskilt till administratör — är
 * en egen, loggad åtgärd under Roller och behörigheter, så att en vanlig
 * personalåtgärd aldrig kan ge högre behörighet än avsett.
 */
export const AdminStaffPage: React.FC<Props> = ({ onNavigate, onlySpecialTeachers = false }) => (
  <>
    <AdminAccountsView
      testId={onlySpecialTeachers ? 'page-admin-speciallarare' : 'page-admin-personal'}
      title={onlySpecialTeachers ? 'Speciallärare' : 'Personal'}
      subtitle={
        onlySpecialTeachers
          ? 'Speciallärares konton och elevkopplingar'
          : 'Lärare, speciallärare och administratörer'
      }
      // Bara en delmängd av PERSONAL_ROLES: speciallärarna.
      roles={onlySpecialTeachers ? ['speciallärare'] : PERSONAL_ROLES}
      createPage="create-user"
      createLabel={onlySpecialTeachers ? 'Skapa speciallärarkonto' : 'Skapa personalkonto'}
      emptyTitle="Inga personalkonton ännu"
      emptyDescription="Skapa ett lärar- eller speciallärarkonto. Kontot får sin roll direkt och kan logga in med användarnamn och lösenord."
      onNavigate={onNavigate}
    />
    <div className="panel-page">
      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">
              <ShieldCheck size={16} aria-hidden="true" /> Skyddet kring personal- och
              administratörskonton
            </h2>
            <p className="card-sub">Samma regler som servern tillämpar</p>
          </div>
        </div>
        <ul className="list">
          <li className="list-item list-item-static">
            Rollen ändras bara under Roller och behörigheter — aldrig här, och
            aldrig på sitt eget konto.
          </li>
          <li className="list-item list-item-static">
            Den sista aktiva administratören kan varken inaktiveras eller
            nedgraderas. Servern nekar åtgärden.
          </li>
          <li className="list-item list-item-static">
            Ett nytt tillfälligt lösenord visas en gång och kräver byte vid nästa
            inloggning. Inget lösenord visas i listan.
          </li>
        </ul>
      </section>
    </div>
  </>
);
