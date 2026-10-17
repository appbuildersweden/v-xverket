import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  onNavigate: (pageId: string) => void;
}

export const AdminComingSoonPage: React.FC<Props> = ({
  title,
  description,
  onNavigate,
}) => (
  <div className="admin-page">
    <div className="card admin-coming-soon">
      <div className="admin-coming-soon-icon">
        <Clock size={28} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <p className="admin-muted">
        Avsnittet byggs i ett senare steg. Inga data ändras och inga befintliga
        funktioner påverkas under tiden.
      </p>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => onNavigate('start')}
      >
        <ArrowLeft size={14} /> Till översikten
      </button>
    </div>
  </div>
);
