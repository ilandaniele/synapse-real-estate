"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MemberInput, type Member } from "@synapse/contracts";
import { ROLES, type Role } from "@synapse/domain";
import { EmptyState } from "@synapse/ui";
import { api, ApiRequestError } from "@/lib/api";
import { keys, useMembers } from "@/lib/queries";
import { useCan, useUser } from "@/lib/session";
import { formatDateTime, ROLE_LABELS } from "@/lib/format";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "@/lib/forms";
import { ConfirmDelete } from "@/components/content";
import { Button, ErrorBanner, Modal, PageHeader, QueryBoundary, SelectField, TableShell, TD, TextField, TH } from "@/components/ui";

const LAST_OWNER_MESSAGE = "La organización debe tener al menos un propietario.";

function memberError(error: unknown): unknown {
  return error instanceof ApiRequestError && error.code === "LAST_OWNER" ? new Error(LAST_OWNER_MESSAGE) : error;
}

function RoleOptions() {
  return ROLES.map((role) => (
    <option key={role} value={role}>
      {ROLE_LABELS[role]}
    </option>
  ));
}

export default function MembersPage() {
  if (!useCan("member:manage")) {
    return <EmptyState title="Sin permiso" description="Solo los propietarios pueden gestionar miembros." />;
  }
  return <MembersView />;
}

function MembersView() {
  const members = useMembers();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; member: Member } | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: keys.members });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api<Member>(`/admin/members/${id}`, { method: "PATCH", body: { role } }),
    onSettled: refresh,
  });

  return (
    <>
      <PageHeader
        title="Miembros"
        description="Personas con acceso al backoffice de tu organización."
        actions={
          <Button variant="primary" onClick={() => setDialog({ mode: "create" })} data-testid="member-create-open">
            Nuevo miembro
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <ErrorBanner error={memberError(changeRole.error)} testId="member-role-error" />
        <QueryBoundary query={members} isEmpty={(items) => items.length === 0} emptyTitle="No hay miembros">
          {(items) => (
            <TableShell caption="Miembros" testId="member-table">
              <thead>
                <tr>
                  <th className={TH}>Email</th>
                  <th className={TH}>Nombre</th>
                  <th className={TH}>Rol</th>
                  <th className={TH}>Alta</th>
                  <th className={TH}>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((member) => (
                  <tr key={member.id} data-testid="member-row">
                    <td className={TD}>{member.email}</td>
                    <td className={TD}>{member.name}</td>
                    <td className={TD}>
                      <label className="sr-only" htmlFor={`role-${member.id}`}>
                        Rol de {member.email}
                      </label>
                      <select
                        id={`role-${member.id}`}
                        value={member.role}
                        disabled={changeRole.isPending}
                        data-testid="member-role"
                        className="min-h-10 rounded-md border border-gray-300 bg-white px-2 text-sm"
                        onChange={(e) => changeRole.mutate({ id: member.id, role: e.target.value as Role })}
                      >
                        <RoleOptions />
                      </select>
                    </td>
                    <td className={TD}>{formatDateTime(member.createdAt)}</td>
                    <td className={TD}>
                      <Button onClick={() => setDialog({ mode: "edit", member })} aria-label={`Gestionar ${member.email}`} data-testid="member-manage">
                        Gestionar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </QueryBoundary>
      </div>
      {dialog?.mode === "create" ? <CreateMemberDialog onClose={() => setDialog(null)} onCreated={refresh} /> : null}
      {dialog?.mode === "edit" ? <ManageMemberDialog member={dialog.member} onClose={() => setDialog(null)} onDeleted={refresh} /> : null}
    </>
  );
}

function CreateMemberDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [password, setPassword] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});

  const create = useMutation({
    mutationFn: (input: MemberInput) => api<Member>("/admin/members", { method: "POST", body: input }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = MemberInput.safeParse({ email, name, role, password });
    if (!parsed.success) {
      setClientErrors(zodFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    create.mutate(parsed.data);
  };

  const errors = { ...apiFieldErrors(create.error), ...clientErrors };

  return (
    <Modal title="Nuevo miembro" onClose={onClose} testId="member-dialog">
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="member-form">
        <TextField label="Email" type="email" autoComplete="off" value={email} error={errors.email} testId="member-field-email" onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Nombre" value={name} error={errors.name} testId="member-field-name" onChange={(e) => setName(e.target.value)} />
        <SelectField label="Rol" value={role} error={errors.role} testId="member-field-role" onChange={(e) => setRole(e.target.value as Role)}>
          <RoleOptions />
        </SelectField>
        <TextField
          label="Contraseña inicial"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint="Mínimo 12 caracteres. Compártela por un canal seguro; el miembro puede cambiarla en «Mi cuenta»."
          testId="member-field-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorBanner error={create.error} testId="member-form-error" />
        <div>
          <Button type="submit" variant="primary" disabled={create.isPending} data-testid="member-save">
            {create.isPending ? "Creando…" : "Crear miembro"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ManageMemberDialog({ member, onClose, onDeleted }: { member: Member; onClose: () => void; onDeleted: () => void }) {
  const isSelf = useUser().email === member.email;
  return (
    <Modal title={member.email} onClose={onClose} testId="member-manage-dialog">
      <p className="text-sm text-gray-700">
        {member.name} · {ROLE_LABELS[member.role]}
      </p>
      {isSelf ? <p className="mt-2 text-sm text-gray-600">Esta es tu cuenta: si te quitas, perderás el acceso.</p> : null}
      <ConfirmDelete
        subject={`a ${member.email} de la organización`}
        buttonLabel="Quitar miembro"
        testId="member-delete"
        remove={() =>
          api<void>(`/admin/members/${member.id}`, { method: "DELETE" }).catch((error: unknown) => {
            throw memberError(error);
          })
        }
        onDeleted={() => {
          onDeleted();
          onClose();
        }}
      />
    </Modal>
  );
}
