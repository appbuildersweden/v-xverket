import React from 'react';
import { SectionCard } from '../../components/ui';
import { MAX_TURNS, MAX_QUESTION_LENGTH, AI_STARTERS, DOC_KINDS, DOC_KIND_LABELS, DOC_LIMITS } from '../../lib/ai';

/** AI-inställningar för administratören — visar konfiguration och gränser. */
export const AdminAiSettingsPage: React.FC = () => (
  <div className="panel-page" data-testid="page-admin-ai-inställningar">
    <SectionCard title="AI-assistentinställningar" subtitle="Konfiguration och gränser för AI-tjänsten">
      <div className="settings-grid">
        <div className="settings-card">
          <h3>Tjänststatus</h3>
          <p>AI-tjänsten är <span id="ai-status">laddar…</span></p>
          <div className="status-details" id="status-details">
            <p>Modell: <span id="model-name">—</span></p>
            <p>Max turer: <span id="max-turns">—</span></p>
            <p>Max frågelängd: <span id="max-question-length">—</span> tecken</p>
          </div>
        </div>

        <div className="settings-card">
          <h3>Gränser och gränser</h3>
          <dl>
            <div>
              <dt>Max konversationsturer</dt>
              <dd>{MAX_TURNS}</dd>
            </div>
            <div>
              <dt>Max frågelängd</dt>
              <dd>{MAX_QUESTION_LENGTH}</dd>
            </div>
            <div>
              <dt>Tillåtna dokumentformat</dt>
              <dd>
                {DOC_KINDS.map((kind) => (
                  <span key={kind} className="chip-chip">
                    {DOC_KIND_LABELS[kind]}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Dokumentgränser</dt>
              <dd>
                {Object.entries(DOC_LIMITS)
                  .filter(([key]) => key !== 'text' && key !== 'cell' && key !== 'title' && key !== 'sheetName')
                  .map(([key, limit]) => (
                    <div key={key}>
                      <span>{key.replace(/([A-Z])/g, ' $1').trim()}: </span>
                      <span>{limit}</span>
                    </div>
                  ))}
              </dd>
            </div>
          </dl>
        </div>

        <div className="settings-card">
          <h3>AI-starters</h3>
          <p>Snabbfrågor som alltid finns tillgängliga:</p>
          <div className="chip-row">
            {AI_STARTERS.map((starter) => (
              <span key={starter} className="chip-chip">
                {starter}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="security-reminder">
        <p>
          Assistenten använder den skyddade funktionen <code>ai-chat</code> — inga hemligheter
          eller service role-nycklar skickas från klienten. Servern verifierar både session
          och roll innan den svarar. Assistenten kan inte skapa konton, ändra roller eller
          läsa hemligheter — sådana åtgärder hanteras under <code>Användare och roller</code>.
        </p>
        <p>
          Skriv inte in personuppgifter eller nycklar i chatten.
        </p>
      </div>
    </SectionCard>
  </div>
);