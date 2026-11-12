import { useEffect, useState } from 'react';
import type { TripPlanDayDto, TripPlanDto } from '../../shared/types.ts';
import { getTripPlan, updateTripPlan } from './api.ts';

interface Props {
  refreshKey: number;
}

const EMPTY_PLAN: TripPlanDto = {
  destination: null,
  startDate: null,
  endDate: null,
  days: [],
  notes: null,
  updatedAt: null,
};

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function TripPlanPanel({ refreshKey }: Props) {
  const [plan, setPlan] = useState<TripPlanDto>(EMPTY_PLAN);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getTripPlan()
      .then(setPlan)
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, [refreshKey]);

  const save = async (patch: Record<string, unknown>) => {
    setError(null);
    try {
      const updated = await updateTripPlan(patch);
      setPlan(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateDay = (index: number, patch: Partial<TripPlanDayDto>) => {
    setPlan({ ...plan, days: plan.days.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  };

  const removeDay = (index: number) => {
    save({ days: plan.days.filter((_, i) => i !== index) });
  };

  const addDay = () => {
    setPlan({ ...plan, days: [...plan.days, { date: '', title: '', activities: [] }] });
  };

  return (
    <aside style={{ borderLeft: '1px solid #ccc', paddingLeft: '1rem', minWidth: '260px' }}>
      <h2>Trip plan</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <div>
        <label>
          Destination
          <input
            value={plan.destination ?? ''}
            onChange={(e) => setPlan({ ...plan, destination: e.target.value })}
          />
        </label>
      </div>
      <div>
        <label>
          Start date
          <input
            type="date"
            value={toDateInputValue(plan.startDate)}
            onChange={(e) => setPlan({ ...plan, startDate: e.target.value || null })}
          />
        </label>
      </div>
      <div>
        <label>
          End date
          <input
            type="date"
            value={toDateInputValue(plan.endDate)}
            onChange={(e) => setPlan({ ...plan, endDate: e.target.value || null })}
          />
        </label>
      </div>
      <div>
        <label>
          Notes
          <textarea value={plan.notes ?? ''} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} />
        </label>
      </div>
      <button
        onClick={() =>
          save({
            destination: plan.destination ?? '',
            ...(plan.startDate ? { startDate: plan.startDate } : {}),
            ...(plan.endDate ? { endDate: plan.endDate } : {}),
            notes: plan.notes ?? '',
          })
        }
      >
        Save details
      </button>

      <h3>Days</h3>
      {plan.days.length === 0 && <p>No days planned yet.</p>}
      <ul>
        {plan.days.map((day, i) => (
          <li key={i}>
            <input type="date" value={toDateInputValue(day.date)} onChange={(e) => updateDay(i, { date: e.target.value })} />
            <input placeholder="Title" value={day.title ?? ''} onChange={(e) => updateDay(i, { title: e.target.value })} />
            <div>
              <textarea
                placeholder="One activity per line"
                value={day.activities.join('\n')}
                onChange={(e) => updateDay(i, { activities: e.target.value.split('\n').filter((a) => a.trim().length > 0) })}
              />
            </div>
            <button onClick={() => save({ days: plan.days })}>Save day</button>
            <button onClick={() => removeDay(i)}>Remove day</button>
          </li>
        ))}
      </ul>
      <button onClick={addDay}>Add day</button>
    </aside>
  );
}

export default TripPlanPanel;
