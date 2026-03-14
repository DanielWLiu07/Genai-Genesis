import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, Project } from '../project-store';

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'proj-1',
  title: 'Test Book',
  author: 'Author A',
  description: 'A test project',
  status: 'uploaded',
  created_at: '2026-03-14T00:00:00Z',
  updated_at: '2026-03-14T00:00:00Z',
  ...overrides,
});

describe('useProjectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
    });
  });

  it('has correct initial state', () => {
    const state = useProjectStore.getState();
    expect(state.projects).toEqual([]);
    expect(state.currentProject).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('setProjects sets the projects array', () => {
    const projects = [makeProject({ id: 'p1' }), makeProject({ id: 'p2', title: 'Second Book' })];
    useProjectStore.getState().setProjects(projects);

    const state = useProjectStore.getState();
    expect(state.projects).toHaveLength(2);
    expect(state.projects[0].id).toBe('p1');
    expect(state.projects[1].title).toBe('Second Book');
  });

  it('setCurrentProject sets current project', () => {
    const project = makeProject();
    useProjectStore.getState().setCurrentProject(project);

    expect(useProjectStore.getState().currentProject).toEqual(project);
    expect(useProjectStore.getState().currentProject?.id).toBe('proj-1');
  });

  it('setCurrentProject can set to null', () => {
    useProjectStore.getState().setCurrentProject(makeProject());
    useProjectStore.getState().setCurrentProject(null);

    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  it('setLoading toggles loading', () => {
    useProjectStore.getState().setLoading(true);
    expect(useProjectStore.getState().loading).toBe(true);

    useProjectStore.getState().setLoading(false);
    expect(useProjectStore.getState().loading).toBe(false);
  });

  it('updateProject updates a project by ID in the projects array', () => {
    useProjectStore.getState().setProjects([
      makeProject({ id: 'p1', title: 'Old Title', status: 'uploaded' }),
      makeProject({ id: 'p2', title: 'Other Project' }),
    ]);

    useProjectStore.getState().updateProject('p1', { title: 'New Title', status: 'analyzing' });

    const projects = useProjectStore.getState().projects;
    expect(projects[0].title).toBe('New Title');
    expect(projects[0].status).toBe('analyzing');
    // Other project unchanged
    expect(projects[1].title).toBe('Other Project');
  });

  it('updateProject also updates currentProject if it matches the ID', () => {
    const project = makeProject({ id: 'p1', title: 'Original' });
    useProjectStore.getState().setProjects([project]);
    useProjectStore.getState().setCurrentProject(project);

    useProjectStore.getState().updateProject('p1', { title: 'Updated', status: 'editing' });

    expect(useProjectStore.getState().currentProject?.title).toBe('Updated');
    expect(useProjectStore.getState().currentProject?.status).toBe('editing');
  });

  it('updateProject does not change currentProject if ID does not match', () => {
    const current = makeProject({ id: 'p1', title: 'Current' });
    useProjectStore.getState().setProjects([current, makeProject({ id: 'p2' })]);
    useProjectStore.getState().setCurrentProject(current);

    useProjectStore.getState().updateProject('p2', { title: 'Changed' });

    expect(useProjectStore.getState().currentProject?.title).toBe('Current');
  });
});
