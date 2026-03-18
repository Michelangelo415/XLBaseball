import React from 'react';

export const PositionBadge = ({ position }) => (
  <span className={`pos-badge pos-${position}`}>{position}</span>
);

export const StatNum = ({ value, good, invert }) => {
  const num = parseFloat(value) || 0;
  let cls = 'stat-num';
  if (good !== undefined) {
    cls += num > 0 ? (good ? ' stat-positive' : ' stat-negative')
                   : num < 0 ? (good ? ' stat-negative' : ' stat-positive') : '';
  }
  return <span className={cls}>{num % 1 === 0 ? num : num.toFixed(1)}</span>;
};

export const Badge = ({ label, type = 'gray' }) => (
  <span className={`badge badge-${type}`}>{label}</span>
);

export const StatusBadge = ({ status }) => {
  const map = {
    pending: ['Pending', 'yellow'],
    accepted: ['Accepted', 'green'],
    rejected: ['Rejected', 'red'],
    commissioner_review: ['Review', 'blue'],
    completed: ['Completed', 'green'],
    voided: ['Voided', 'gray'],
    prospect: ['Prospect', 'yellow'],
    called_up: ['Called Up', 'blue'],
    activated: ['Active', 'green'],
    became_fa: ['Free Agent', 'gray'],
  };
  const [label, type] = map[status] || [status, 'gray'];
  return <Badge label={label} type={type} />;
};

export const PlayerRow = ({ player, slotType, actions }) => (
  <tr>
    <td>
      <PositionBadge position={slotType || player.primary_position} />
    </td>
    <td>
      <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{player.full_name}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{player.mlb_team}</div>
    </td>
    <td><PositionBadge position={player.primary_position} /></td>
    <td>
      {player.status === 'injured'
        ? <Badge label="IL" type="red" />
        : player.is_prospect
        ? <Badge label="Prospect" type="yellow" />
        : <Badge label="Active" type="green" />}
    </td>
    {actions && <td>{actions(player)}</td>}
  </tr>
);

export const LoadingSpinner = ({ text }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px' }}>
    <div className="spinner" />
    {text && <div className="loading-text">{text}</div>}
  </div>
);

export const EmptyState = ({ icon, text }) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon || '📭'}</div>
    <div className="empty-state-text">{text || 'No data found'}</div>
  </div>
);

export const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, danger }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
