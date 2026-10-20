import React from 'react';
import { SectionPage } from '../components/SectionPage';
import { AdminStartPage } from './admin/AdminStartPage';
import { AdminAccountsPage } from './admin/AdminAccountsPage';
import { AdminStudentsPage } from './admin/AdminStudentsPage';
import { AdminStaffPage } from './admin/AdminStaffPage';
import { AdminRolesPage } from './admin/AdminRolesPage';
import { AdminSchedulesPage } from './admin/AdminSchedulesPage';
import { AdminAssignmentsPage } from './admin/AdminAssignmentsPage';
import { AdminSettingsPage } from './admin/AdminSettingsPage';
import { AdminCreateAccountPage } from './admin/AdminCreateAccountPage';
import { AdminRegistrationsPage } from './admin/AdminRegistrationsPage';
import { AdminAuditLogPage } from './admin/AdminAuditLogPage';
import { AdminAiPage } from './admin/AdminAiPage';
import { AdminAiSettingsPage } from './admin/AdminAiSettingsPage';
import { AdminUpdatesPage } from './admin/AdminUpdatesPage';
import { AdminShopPage } from './admin/AdminShopPage';

interface Props {
  pageId: string;
  onNavigate: (pageId: string) => void;
}

/** Vad respektive sektion ska innehålla när den byggs ut. */
const PLANNED: Record<string, string[]> = {
  dokument: ['Elevdokument och lärardokument med åtkomststyrning'],
  meddelanden: ['Meddelanden och nyheter till elever och personal'],
  loggar: ['Administrativa händelser och säkerhetshändelser'],
  kopplingar: ['Kopplingar mellan elever och personal'],
  nyheter: ['Nyheter som visas i appen'],
};

/**
 * Adminpanelen. Rollen 'admin' krävs — kontrolleras av ruttvakten och av
 * servern vid varje privilegierad åtgärd.
 *
 * Sidorna som har en riktig datamodell är byggda mot backend (konton, elever,
 * personal, roller, scheman, uppgifter och den egna profilen). Sidorna som ännu
 * saknar modell visar ett tydligt planerat läge i stället för påhittad data.
 */
export const AdminPanel: React.FC<Props> = ({ pageId, onNavigate }) => {
  const renderPage = () => {
    if (pageId === 'start') return <AdminStartPage onNavigate={onNavigate} />;
    if (pageId === 'anvandare') return <AdminAccountsPage onNavigate={onNavigate} />;
    if (pageId === 'anv-elever') return <AdminStudentsPage onNavigate={onNavigate} />;
    if (pageId === 'anv-personal') return <AdminStaffPage onNavigate={onNavigate} />;
    if (pageId === 'anv-speciallarare') {
      return <AdminStaffPage onNavigate={onNavigate} onlySpecialTeachers />;
    }
    if (pageId === 'roller') return <AdminRolesPage onNavigate={onNavigate} />;
    if (pageId === 'amnen') return <AdminSchedulesPage onNavigate={onNavigate} />;
    if (pageId === 'klasser') return <SectionPage panel="admin" pageId={pageId} />;
    if (pageId === 'uppgifter') return <AdminAssignmentsPage onNavigate={onNavigate} />;
    if (pageId === 'dokument' || pageId === 'meddelanden' || pageId === 'loggar' || pageId === 'kopplingar' || pageId === 'nyheter') {
      return <SectionPage panel="admin" pageId={pageId} planned={PLANNED[pageId]} />;
    }
    if (pageId === 'ai-assistent') return <AdminAiPage />;
    if (pageId === 'ai-installningar' || pageId === 'ai-inställningar') return <AdminAiSettingsPage />;
    if (pageId === 'installningar') return <AdminSettingsPage onNavigate={onNavigate} />;
    if (pageId === 'uppdateringar') return <AdminUpdatesPage />;
    if (pageId === 'shop') return <AdminShopPage />;
    if (pageId === 'create-user') return <AdminCreateAccountPage onNavigate={onNavigate} />;
    if (pageId === 'ansokningar') return <AdminRegistrationsPage />;
    if (pageId === 'granskningslogg') return <AdminAuditLogPage />;
    return <SectionPage panel="admin" pageId={pageId} planned={PLANNED[pageId] ?? []} />;
  };

  return <div data-testid="panel-admin">{renderPage()}</div>;
};
