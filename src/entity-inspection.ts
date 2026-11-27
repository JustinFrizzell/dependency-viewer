import * as documentEdits from './document-edits';
import type { DocumentSession } from './document-session';
import type { GraphEntity } from './document-types';

type Draft = { changed: () => boolean | undefined; error: HTMLElement };

type InspectionOptions = {
  session: DocumentSession;
  entities: Map<string, GraphEntity>;
  downstream: Map<string, string[]>;
  selectEntity: (name: string) => boolean;
  requireNoConflictingFormDraft: (owner?: string) => void;
  updateDocumentControls: () => void;
  refreshDocument: (selectedName?: string) => void;
  editProperties: (name: string) => void;
};

export function setupEntityInspection({
  session,
  entities,
  downstream,
  selectEntity,
  requireNoConflictingFormDraft,
  updateDocumentControls,
  refreshDocument,
  editProperties,
}: InspectionOptions) {
  const inspector = document.getElementById('selection-status') as HTMLElement;
  let entityDraft: Draft | null = null;
  let dependencyDraft: Draft | null = null;
  const hasEntityDraft = () => !!entityDraft?.changed();
  const hasDependencyDraft = () => !!dependencyDraft?.changed();

  function canChangeSelection() {
    if (hasEntityDraft()) {
      entityDraft!.error.textContent = 'Error: Apply or discard the Entity draft before changing selection.';
      return false;
    }
    if (hasDependencyDraft()) {
      dependencyDraft!.error.textContent =
        'Error: Apply or discard the Direct dependency draft before changing selection.';
      return false;
    }
    return true;
  }

  function showEntity(name: string) {
    dependencyDraft = null;
    const entity = entities.get(name)!;
    const card = document.getElementById('inspector') as HTMLElement;
    card.classList.remove('editor-open');
    inspector.replaceChildren();
    const title = document.createElement('div');
    title.className = 'entity-overview-heading';
    const icon = document.createElement('span');
    icon.className = 'entity-overview-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '▦';
    const titleText = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = entity.name;
    const subtitle = document.createElement('div');
    subtitle.className = 'entity-overview-subtitle';
    subtitle.textContent = entity.documented ? 'Documented Entity' : 'Undocumented Entity';
    titleText.append(heading, subtitle);
    title.append(icon, titleText);
    inspector.appendChild(title);
    const badge = document.createElement('span');
    badge.className = entity.documented ? 'documented-badge' : 'undocumented-badge';
    badge.textContent = entity.documented ? 'Documented entity' : 'Undocumented entity';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit-only entity-editor-toggle';
    editButton.textContent = 'Edit Entity';
    editButton.setAttribute('aria-expanded', 'false');
    editButton.addEventListener('click', () => {
      const open = card.classList.toggle('editor-open');
      editButton.setAttribute('aria-expanded', String(open));
      editButton.textContent = open ? 'Close editor' : 'Edit Entity';
      if (open) {
        for (const id of ['entity-list', 'colour-settings', 'export-menu']) {
          (document.getElementById(id) as HTMLDetailsElement).open = false;
        }
        card.style.left = `${Math.max(0, Math.min(card.offsetLeft, window.innerWidth - card.offsetWidth))}px`;
        card.style.top = `${Math.max(0, Math.min(card.offsetTop, window.innerHeight - card.offsetHeight))}px`;
        nameInput.focus();
      }
    });
    inspector.appendChild(editButton);
    const form = document.createElement('form');
    form.id = 'edit-entity-form';
    form.className = 'edit-only';
    form.noValidate = true;
    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'edit-entity-name';
    nameLabel.textContent = 'Entity name';
    const nameInput = document.createElement('input');
    nameInput.id = 'edit-entity-name';
    nameInput.value = name;
    nameInput.setAttribute('aria-describedby', 'edit-entity-error');
    form.append(nameLabel, nameInput);
    let descriptionInput: HTMLTextAreaElement | undefined;
    if (entity.documented) {
      const descriptionLabel = document.createElement('label');
      descriptionLabel.htmlFor = 'edit-entity-description';
      descriptionLabel.textContent = 'Description';
      descriptionInput = document.createElement('textarea');
      descriptionInput.id = 'edit-entity-description';
      descriptionInput.value = entity.description || '';
      descriptionInput.setAttribute('aria-describedby', 'edit-entity-error');
      form.append(descriptionLabel, descriptionInput);
    }
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Apply Entity changes';
    const error = document.createElement('p');
    error.id = 'edit-entity-error';
    error.setAttribute('role', 'alert');
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.id = 'discard-entity-draft';
    discard.textContent = 'Discard Entity draft';
    entityDraft = {
      changed: () =>
        nameInput.value !== name || (descriptionInput && descriptionInput.value !== (entity.description || '')),
      error,
    };
    discard.addEventListener('click', () => {
      nameInput.value = name;
      if (descriptionInput) descriptionInput.value = entity.description || '';
      error.textContent = '';
      updateDocumentControls();
    });
    form.append(save, discard, error);
    form.addEventListener('input', () => {
      error.textContent = '';
      updateDocumentControls();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        requireNoConflictingFormDraft('entity');
        const newName = nameInput.value;
        documentEdits.editEntity(session, name, newName, descriptionInput && descriptionInput.value);
        const previousDraft = entityDraft;
        entityDraft = null;
        refreshDocument(newName);
        if (form.isConnected && !entityDraft) entityDraft = previousDraft;
        (document.getElementById('edit-entity-name') as HTMLInputElement).focus();
      } catch (reason) {
        error.textContent = `Error: ${(reason as Error).message}`;
        updateDocumentControls();
      }
    });
    inspector.appendChild(form);
    if (entity.documented) {
      const propertiesButton = document.createElement('button');
      propertiesButton.type = 'button';
      propertiesButton.className = 'edit-only entity-edit-control';
      propertiesButton.textContent = 'Edit properties';
      propertiesButton.addEventListener('click', () => {
        try {
          requireNoConflictingFormDraft();
          editProperties(name);
        } catch (reason) {
          error.textContent = `Error: ${(reason as Error).message}`;
        }
      });
      inspector.appendChild(propertiesButton);
    }
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.id = 'delete-entity';
    deleteButton.className = 'edit-only entity-edit-control';
    deleteButton.textContent = 'Remove Entity';
    const confirmation = document.createElement('fieldset');
    confirmation.className = 'edit-only entity-edit-control';
    confirmation.hidden = true;
    const prompt = document.createElement('legend');
    prompt.textContent =
      entity.documented && downstream.get(name)!.length
        ? 'Remove this Entity and retain or remove its references?'
        : 'Remove this Entity and its references?';
    confirmation.appendChild(prompt);
    function choice(id: string, label: string, action: () => void) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `delete-entity-${id}`;
      button.textContent = label;
      button.addEventListener('click', action);
      confirmation.appendChild(button);
    }
    function removeEntity(removeReferences: boolean) {
      try {
        requireNoConflictingFormDraft();
        documentEdits.removeEntity(session, name, removeReferences);
        refreshDocument();
        const target = (document.getElementById('entity-list') as HTMLDetailsElement).hidden
          ? document.querySelector<HTMLElement>('#add-entity-panel summary')
          : document.querySelector<HTMLElement>('#entity-list summary');
        target!.focus();
      } catch (reason) {
        error.textContent = `Error: ${(reason as Error).message}`;
      }
    }
    if (entity.documented && downstream.get(name)!.length) {
      choice('retain', 'Retain references as undocumented', () => removeEntity(false));
    }
    choice(
      'remove',
      entity.documented && downstream.get(name)!.length ? 'Remove references too' : 'Confirm removal',
      () => removeEntity(true),
    );
    choice('cancel', 'Cancel', () => {
      confirmation.hidden = true;
      deleteButton.focus();
    });
    deleteButton.addEventListener('click', () => {
      if (session.hasDraft()) {
        error.textContent = 'Error: Apply or discard the JSON draft before editing the graph.';
        return;
      }
      error.textContent = '';
      confirmation.hidden = false;
      confirmation.querySelector('button')!.focus();
    });
    inspector.append(deleteButton, confirmation);
    const details = document.createElement('div');
    details.className = 'inspector-details';
    const description = document.createElement('section');
    const descriptionHeading = document.createElement('h3');
    descriptionHeading.textContent = 'Description';
    const descriptionText = document.createElement('p');
    descriptionText.textContent = entity.documented ? entity.description || 'No description provided.' : 'Unknown';
    description.append(descriptionHeading, descriptionText, badge);
    if (entity.extras && entity.extras.length) {
      const extras = document.createElement('dl');
      extras.className = 'entity-extras';
      for (const [key, value] of entity.extras) {
        const label = document.createElement('dt');
        label.textContent = key;
        const content = document.createElement('dd');
        content.textContent = typeof value === 'string' ? value : JSON.stringify(value);
        extras.append(label, content);
      }
      description.appendChild(extras);
    }
    details.appendChild(description);
    function relationshipSection(
      title: string,
      names: string[],
      emptyText: string,
      remove?: ((name: string) => void) | null,
    ) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = title;
      section.appendChild(heading);
      if (!names.length) {
        const empty = document.createElement('p');
        empty.textContent = emptyText;
        section.appendChild(empty);
      } else {
        const list = document.createElement('ul');
        for (const relatedName of names) {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'related-entity';
          button.textContent = relatedName + (entities.get(relatedName)!.documented ? '' : ' (undocumented)');
          button.addEventListener('click', () => selectEntity(relatedName));
          item.appendChild(button);
          if (remove) {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'edit-only entity-edit-control';
            removeButton.textContent = 'Remove';
            removeButton.setAttribute('aria-label', `Remove Direct dependency ${relatedName}`);
            removeButton.addEventListener('click', () => remove(relatedName));
            item.appendChild(removeButton);
          }
          list.appendChild(item);
        }
        section.appendChild(list);
      }
      return section;
    }
    const dependencyError = document.createElement('p');
    dependencyError.id = 'dependency-error';
    dependencyError.setAttribute('role', 'alert');
    let dependencyRejected = false;
    function changeDependency(dependency: string, add: boolean) {
      let validating = false;
      try {
        requireNoConflictingFormDraft(add ? 'dependency' : undefined);
        if (session.hasDraft()) throw new Error('Apply or discard the JSON draft before editing the graph.');
        validating = true;
        documentEdits.editDependency(session, name, dependency, add);
        dependencyDraft = null;
        refreshDocument(name);
        (document.getElementById('connection-status') as HTMLElement).textContent =
          `${add ? 'Added' : 'Removed'} ${dependency} as a Direct dependency of ${name}.`;
        (document.getElementById('new-dependency-name') as HTMLInputElement).focus();
      } catch (problem) {
        if (add && validating) dependencyRejected = true;
        dependencyError.textContent = `Error: ${(problem as Error).message}`;
        updateDocumentControls();
      }
    }
    const removeDependency = entity.documented ? (dependency: string) => changeDependency(dependency, false) : null;
    const dependencies = relationshipSection(
      'Direct dependencies',
      entity.dependencies,
      entity.documented ? 'No dependencies.' : 'Unknown',
      removeDependency,
    );
    if (entity.documented) {
      const form = document.createElement('form');
      form.id = 'add-dependency-form';
      form.className = 'edit-only';
      form.noValidate = true;
      const label = document.createElement('label');
      label.htmlFor = 'new-dependency-name';
      label.textContent = 'Direct dependency name';
      const input = document.createElement('input');
      input.id = 'new-dependency-name';
      input.type = 'text';
      input.autocomplete = 'off';
      input.setAttribute('list', 'dependency-candidates');
      input.setAttribute('aria-describedby', 'dependency-error');
      const candidates = document.createElement('datalist');
      candidates.id = 'dependency-candidates';
      for (const candidate of entities.values()) {
        const option = document.createElement('option');
        option.value = candidate.name;
        candidates.appendChild(option);
      }
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.textContent = 'Add dependency';
      const discard = document.createElement('button');
      discard.type = 'button';
      discard.id = 'discard-dependency-draft';
      discard.textContent = 'Discard dependency draft';
      dependencyDraft = { changed: () => dependencyRejected || input.value !== '', error: dependencyError };
      discard.addEventListener('click', () => {
        input.value = '';
        dependencyRejected = false;
        dependencyError.textContent = '';
        updateDocumentControls();
      });
      form.append(label, input, candidates, submit, discard, dependencyError);
      form.addEventListener('input', () => {
        dependencyRejected = false;
        dependencyError.textContent = '';
        updateDocumentControls();
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        changeDependency(input.value, true);
      });
      dependencies.appendChild(form);
    }
    details.append(
      dependencies,
      relationshipSection('Direct downstream entities', downstream.get(name)!, 'No downstream entities.'),
    );
    inspector.insertBefore(details, form);
  }
  return { hasEntityDraft, hasDependencyDraft, canChangeSelection, showEntity };
}
