import { useState, useEffect } from 'react';
import { skills, SkillInfo } from '../api';

export default function Skills() {
  const [skillList, setSkillList] = useState<SkillInfo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const data = await skills.list();
      setSkillList(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Skills</h1>

      {error && <div className="text-red-600 bg-red-50 p-3 rounded-lg mb-4">{error}</div>}

      {skillList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No skills installed yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Add skills to <code className="bg-gray-100 px-1 py-0.5 rounded">~/.hive/workspaces/default/skills/</code>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {skillList.map(skill => (
            <div
              key={skill.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{skill.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{skill.description}</p>
                </div>
                {skill.isShared && (
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                    Shared
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
