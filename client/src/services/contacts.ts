/**
 * @deprecated Legacy entry point — import from '@services/contacts/contacts' instead.
 * Re-exported for backward compatibility with ContactSearchInput.
 */
export type { Contact } from "@typedefs/contacts";
export {
  searchContacts,
  createContact,
  getContact,
} from "@services/contacts/contacts";
