import React, { useEffect, useState } from 'react';
import { api, getUser, isOwnerOrAdmin } from '../api';

export default function Dashboard({ navigate }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const user = getUser();
  const isAdmin = isOwnerOrAdmin();

  useEffect(() => {
    api('getDashboard').then(r => {
      if (r.status === 'ok') setData(r.data);
      setLoading(false);
    });
  }, []);

  const month = new Date().toLocaleString('default', { month: 'long' });

  return (
    <div className="page">
      {/* Welcome */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-dark)' }}>
          Good {getGreeting()}, {user?.Name}!
        </div>
        <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {loading ? (
        <div className="empty"><p>Loading…</p></div>
      ) : (
        <>
          {/* Stats */}
          {isAdmin && (
            <div className="stats-row">
              <div className="stat">
                <div className="stat-label">Revenue · {month}</div>
                <div className="stat-value">${(data?.revenueThisMonth || 0).toLocaleString()}</div>
                <div className="stat-sub">paid invoices</div>
              </div>
              <div className="stat amber">
                <div className="stat-label">Outstanding</div>
                <div className="stat-value">${(data?.outstandingTotal || 0).toLocaleString()}</div>
                <div className="stat-sub">{data?.outstandingInvoices || 0} invoice(s)</div>
              </div>
              <div className="stat">
                <div className="stat-label">Jobs · {month}</div>
                <div className="stat-value">{data?.jobsThisMonth || 0}</div>
                <div className="stat-sub">
                  <span className="div-spray">Spray {data?.sprayJobs || 0}</span>{' '}
                  <span className="div-tree">Tree {data?.treeJobs || 0}</span>
                </div>
              </div>
              <div className="stat blue">
                <div className="stat-label">Miles · {month}</div>
                <div className="stat-value">{data?.milesThisMonth || 0}</div>
                <div className="stat-sub">logged</div>
              </div>
            </div>
          )}

          {/* Clocked in */}
          <div className="card">
            <div className="card-header"><h3>🕐 Currently working</h3></div>
            <div className="card-body">
              {data?.clockedIn?.length > 0 ? (
                data.clockedIn.map(name => (
                  <div key={name} className="row" style={{ padding: '4px 0' }}>
                    <span className="clock-dot active" />
                    <span style={{ fontWeight: 600 }}>{name}</span>
                  </div>
                ))
              ) : (
                <p className="text-muted">No one clocked in right now.</p>
              )}
            </div>
          </div>

          {/* License warnings */}
          {data?.expiringLicenses?.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--amber)' }}>
              <div className="card-header"><h3>⚠️ License alerts</h3></div>
              <div>
                {data.expiringLicenses.map((lic, i) => (
                  <div key={i} className="list-item">
                    <div className="list-item-main">
                      <div className="list-item-title">{lic.name}</div>
                      <div className="list-item-sub">{lic.type} · expires {lic.expires}</div>
                    </div>
                    <span className={`badge ${lic.days <= 14 ? 'badge-red' : 'badge-amber'}`}>{lic.days}d</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="section-heading">Quick actions</div>
          <div className="gap-stack">
            <button className="big-btn big-btn-green" onClick={() => navigate('clock')}>
              <span className="btn-icon">⏱</span>
              <div className="btn-text">
                <span className="btn-label">Clock In / Out</span>
                <span className="btn-sub">Track your hours</span>
              </div>
            </button>
            <button className="big-btn big-btn-outline" onClick={() => navigate('mileage')}>
              <span className="btn-icon">🚛</span>
              <div className="btn-text">
                <span className="btn-label">Log Mileage</span>
                <span className="btn-sub">Record truck miles</span>
              </div>
            </button>
            {isAdmin && (
              <button className="big-btn big-btn-dark" onClick={() => navigate('estimates')}>
                <span className="btn-icon">📋</span>
                <div className="btn-text">
                  <span className="btn-label">New Estimate</span>
                  <span className="btn-sub">Create a quote for a job</span>
                </div>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
