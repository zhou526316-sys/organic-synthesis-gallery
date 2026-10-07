#!/usr/bin/env python3
"""Exercise the real, dormant PDF Vault migration and prepared claim in SQLite.

Run with: python scripts/test-pdf-vault-schema.py -v
No network, production writes, credentials, or third-party Python packages.
These checks establish the P0 database contract, not an implemented import API.
"""

from concurrent.futures import ThreadPoolExecutor
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parents[1]
FULL_SCHEMA = (ROOT / "cloudflare/schema.sql").read_text(encoding="utf-8")
MIGRATION = (ROOT / "cloudflare/pdf-vault-v1.sql").read_text(encoding="utf-8")
CONSUME = (ROOT / "cloudflare/pdf-vault-session-consume.sql").read_text(encoding="utf-8")
MARKER = "-- BEGIN PDF Vault P0 (cloudflare/pdf-vault-v1.sql)"
END_MARKER = "-- END PDF Vault P0"
BEFORE_P0, _, P0_AND_LATER = FULL_SCHEMA.partition(MARKER)
# Remove only P0; independently appended modules must remain in the baseline.
BASE_SCHEMA = BEFORE_P0 + P0_AND_LATER.partition(END_MARKER)[2]
NOW = 1_791_353_600_000
DOI = "10.5555/vault-test"
OTHER_DOI = "10.5555/another-document"
HASH_A = "a" * 64
HASH_B = "b" * 64
VAULT_TABLES = ("user_documents", "user_document_copies", "pdf_capture_sessions")


def schema_signature(connection):
    return connection.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    ).fetchall()


def insert(connection, table, values):
    # Table/column names are fixed test fixtures; all values are bound parameters.
    return connection.execute(
        f"INSERT INTO {table} ({','.join(values)}) VALUES ({','.join('?' for _ in values)})",
        tuple(values.values()),
    )


class PdfVaultSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(FULL_SCHEMA)
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone(), (1,))
        for user in ("user_a", "user_b", "owner"):
            insert(self.db, "users", {"id": user, "created_at": NOW, "updated_at": NOW})
        self.document()
        self.sequence = 0

    def tearDown(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.db.close()

    def document(self, **overrides):
        values = dict(user_id="user_a", doi=DOI, created_at=NOW, updated_at=NOW)
        values.update(overrides)
        return insert(self.db, "user_documents", values)

    def copy(self, **overrides):
        self.sequence += 1
        values = dict(
            id=f"copy_{self.sequence}", user_id="user_a", doi=DOI,
            content_hash=HASH_A, storage_kind="local_folder", device_id="device_a",
            provider=None, provider_ref=None, byte_length=1024,
            version_kind="publisher", state="available", acquired_at=NOW,
            last_verified_at=NOW, created_at=NOW, updated_at=NOW,
        )
        values.update(overrides)
        insert(self.db, "user_document_copies", values)
        return values

    def session(self, **overrides):
        self.sequence += 1
        values = dict(
            id=f"session_{self.sequence}", user_id="user_a", doi=DOI,
            publisher="acs", destination="local_folder", device_id="device_a",
            nonce_hash=hashlib.sha256(f"fixture_{self.sequence}".encode()).hexdigest(),
            max_bytes=4096, created_at=NOW, expires_at=NOW + 600_000,
            used_at=None, revoked_at=None,
        )
        values.update(overrides)
        insert(self.db, "pdf_capture_sessions", values)
        return values

    def consume(self, session, **overrides):
        values = dict(session, now=NOW + 1, byte_length=1024)
        values.update(overrides)
        params = tuple(values[key] for key in (
            "now", "user_id", "id", "doi", "publisher", "destination", "device_id",
            "nonce_hash", "byte_length",
        ))
        return self.db.execute(CONSUME, params).rowcount

    def test_isolated_migration_matches_full_schema_and_is_idempotent(self):
        self.assertEqual(FULL_SCHEMA.count(MARKER), 1)
        self.assertEqual(FULL_SCHEMA.count(END_MARKER), 1)
        self.assertLess(FULL_SCHEMA.index(MARKER), FULL_SCHEMA.index(END_MARKER))
        other = sqlite3.connect(":memory:")
        self.addCleanup(other.close)
        other.executescript(BASE_SCHEMA)
        baseline = schema_signature(other)
        other.executescript(MIGRATION)
        signature = schema_signature(other)
        other.executescript(MIGRATION)
        self.assertEqual(schema_signature(other), signature)
        self.assertEqual(signature, schema_signature(self.db))
        self.assertTrue(set(baseline).issubset(set(signature)))
        self.assertEqual(other.execute("PRAGMA foreign_keys").fetchone(), (1,))
        self.assertEqual(other.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_migration_does_not_mutate_owner_data_or_grant_ordinary_access(self):
        old = sqlite3.connect(":memory:")
        self.addCleanup(old.close)
        old.executescript(BASE_SCHEMA)
        for user in ("owner", "user_a"):
            insert(old, "users", {"id": user, "created_at": NOW, "updated_at": NOW})
        insert(old, "user_capabilities", dict(
            user_id="owner", capability="private_pdf_read", granted_at=NOW, granted_by="fixture"))
        insert(old, "private_pdf_documents", dict(
            id="owner_doc", doi=DOI, publisher="acs", version_kind="version_of_record",
            content_hash=HASH_A, r2_key="private/fixture.pdf", byte_length=1024,
            captured_at=NOW, processing_state="ready", active=1, created_at=NOW, updated_at=NOW))
        insert(old, "private_pdf_access_tokens", dict(
            token_hash="fixture_read_hash", user_id="owner", document_id="owner_doc",
            created_at=NOW, expires_at=NOW + 300_000))
        insert(old, "private_pdf_capture_leases", dict(
            token_hash="fixture_lease_hash", user_id="owner", created_at=NOW,
            expires_at=NOW + 604_800_000))
        protected = ("private_pdf_documents", "private_pdf_access_tokens",
                     "private_pdf_capture_leases", "user_capabilities", "users")
        before = {table: old.execute(f"SELECT * FROM {table}").fetchall() for table in protected}
        definitions = {row[1]: row for row in schema_signature(old) if row[2] in protected}
        old.executescript(MIGRATION)
        old.executescript(MIGRATION)
        for table in protected:
            self.assertEqual(old.execute(f"SELECT * FROM {table}").fetchall(), before[table])
        self.assertEqual(
            {row[1]: row for row in schema_signature(old) if row[2] in protected}, definitions)
        for table in VAULT_TABLES:
            self.assertEqual(old.execute(f"SELECT COUNT(*) FROM {table}").fetchone(), (0,))
        self.assertEqual(old.execute(
            "SELECT capability FROM user_capabilities WHERE user_id='user_a'").fetchall(), [])

    def test_document_owner_and_doi_are_required_and_normalized(self):
        for user_id, doi in (("absent", OTHER_DOI), (None, OTHER_DOI),
                             ("user_a", "https://doi.org/10.5555/test"),
                             ("user_a", "10.5555/UPPER"), ("user_a", "10.5555/with space"),
                             ("user_a", "10.5555/new\nline"), ("user_a", "")):
            with self.subTest(user_id=user_id, doi=doi), self.assertRaises(sqlite3.IntegrityError):
                self.document(user_id=user_id, doi=doi)

    def test_preferences_require_hash_and_version_together(self):
        self.document(doi=OTHER_DOI, preferred_content_hash=HASH_A, preferred_version_kind="publisher")
        for overrides in (dict(preferred_content_hash=HASH_A), dict(preferred_version_kind="publisher"),
                          dict(preferred_content_hash="broken", preferred_version_kind="unknown")):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.document(doi="10.5555/new", **overrides)

    def test_document_identity_cannot_be_reassigned(self):
        for column, value in (("user_id", "user_b"), ("doi", OTHER_DOI), ("created_at", NOW - 1)):
            with self.subTest(column=column), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(f"UPDATE user_documents SET {column}=? WHERE user_id='user_a' AND doi=?",
                                (value, DOI))

    def test_copy_and_capture_cannot_borrow_another_users_document(self):
        for factory in (self.copy, self.session):
            for overrides in (dict(user_id="user_b"), dict(doi=OTHER_DOI), dict(user_id=None)):
                with self.subTest(factory=factory.__name__, overrides=overrides):
                    with self.assertRaises(sqlite3.IntegrityError):
                        factory(**overrides)
        self.document(user_id="user_b", doi=OTHER_DOI)
        with self.assertRaises(sqlite3.IntegrityError):
            self.copy(user_id="user_b", doi=DOI)

    def test_same_hash_and_copy_id_are_independent_account_records(self):
        a = self.copy(id="same_copy")
        self.assertEqual(self.db.execute(
            "SELECT id FROM user_document_copies WHERE user_id=? AND content_hash=?",
            ("user_b", HASH_A)).fetchall(), [])
        self.document(user_id="user_b")
        b = self.copy(id="same_copy", user_id="user_b")
        self.assertEqual(a["content_hash"], b["content_hash"])
        self.assertEqual(self.db.execute(
            "SELECT user_id FROM user_document_copies WHERE content_hash=? ORDER BY user_id",
            (HASH_A,)).fetchall(), [("user_a",), ("user_b",)])
        self.assertEqual(self.db.execute("SELECT * FROM private_pdf_access_tokens").fetchall(), [])

    def test_copy_versions_coexist_and_cannot_be_overwritten(self):
        first = self.copy(id="publisher_copy")
        self.copy(id="accepted_copy", version_kind="accepted_manuscript", content_hash=HASH_B)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM user_document_copies").fetchone(), (2,))
        self.document(user_id="user_b")
        for column, value in (("content_hash", HASH_B), ("content_hash", None),
                              ("byte_length", 2048), ("version_kind", "preprint"),
                              ("user_id", "user_b"), ("id", "reassigned"),
                              ("device_id", "device_b"), ("storage_kind", "opfs")):
            with self.subTest(column=column), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(f"UPDATE user_document_copies SET {column}=? WHERE id=?",
                                (value, first["id"]))

    def test_pending_copy_can_fill_identity_once_and_become_available(self):
        copy = self.copy(content_hash=None, byte_length=None, acquired_at=None,
                         last_verified_at=None, state="pending")
        self.db.execute(
            "UPDATE user_document_copies SET content_hash=?,byte_length=1024,acquired_at=?,"
            "last_verified_at=?,state='available' WHERE user_id=? AND doi=? AND id=?",
            (HASH_A, NOW, NOW, copy["user_id"], DOI, copy["id"]))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE user_document_copies SET content_hash=? WHERE id=?", (HASH_B, copy["id"]))

    def test_revoked_and_deleted_copies_require_new_copy_identity_to_restore(self):
        for terminal in ("revoked", "deleted"):
            copy = self.copy(state=terminal)
            for target in ("pending", "available", "missing", "revoked", "deleted"):
                if target == terminal:
                    continue
                with self.subTest(terminal=terminal, target=target), self.assertRaises(sqlite3.IntegrityError):
                    self.db.execute("UPDATE user_document_copies SET state=? WHERE id=?", (target, copy["id"]))
            self.db.execute("UPDATE user_document_copies SET updated_at=? WHERE id=?", (NOW + 1, copy["id"]))
        self.copy(id="new_import", state="available")

    def test_available_copy_requires_valid_complete_metadata(self):
        for overrides in (dict(content_hash=None), dict(content_hash="a" * 63),
                          dict(content_hash="A" * 64), dict(byte_length=None), dict(byte_length=0),
                          dict(byte_length=1.5), dict(byte_length=9_007_199_254_740_992),
                          dict(acquired_at=None), dict(last_verified_at=None),
                          dict(last_verified_at=NOW - 1), dict(state="ready"),
                          dict(version_kind="version_of_record")):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.copy(**overrides)

    def test_local_copy_never_accepts_server_synced_path_handle_or_provider_ref(self):
        for overrides in (dict(device_id=None), dict(device_id="C:\\Users\\person"),
                          dict(provider="local"), dict(provider_ref="opaque_but_forbidden"),
                          dict(id="../secret.pdf"), dict(id="https://example.test/pdf")):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.copy(**overrides)
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(user_document_copies)")}
        self.assertFalse(columns & {"path", "local_path", "handle", "token", "password", "cookie", "pdf_bytes"})

    def test_hash_and_opaque_metadata_reject_binary_bindings(self):
        for overrides in (dict(id=b"copy"), dict(device_id=b"device"), dict(content_hash=b"a" * 64),
                          dict(storage_kind="personal_cloud", device_id=None,
                               provider="reserved", provider_ref=b"opaque")):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.copy(**overrides)
        for overrides in (dict(id=b"session"), dict(device_id=b"device"), dict(nonce_hash=b"b" * 64)):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.session(**overrides)

    def test_reserved_provider_metadata_requires_opaque_identifiers_without_device(self):
        for kind in ("personal_cloud", "gallery_cloud", "public_oa"):
            self.copy(storage_kind=kind, device_id=None, provider="reserved", provider_ref="opaque_ref")
        for ref in ("https://example.test/pdf?token=fixture", "folder/document.pdf", "user:password", "a b"):
            with self.subTest(ref=ref), self.assertRaises(sqlite3.IntegrityError):
                self.copy(storage_kind="personal_cloud", device_id=None, provider="reserved", provider_ref=ref)
        with self.assertRaises(sqlite3.IntegrityError):
            self.copy(storage_kind="personal_cloud", device_id="device_a", provider="reserved", provider_ref="opaque")
        self.assertEqual(self.db.execute("SELECT * FROM user_capabilities").fetchall(), [])

    def test_capture_ttl_size_nonce_and_local_destination_constraints(self):
        for ttl in (600_000, 900_000):
            self.session(expires_at=NOW + ttl)
        for overrides in (dict(expires_at=NOW + 599_999), dict(expires_at=NOW + 900_001),
                          dict(expires_at=NOW), dict(max_bytes=0), dict(max_bytes=-1),
                          dict(max_bytes=1.5), dict(max_bytes=9_007_199_254_740_992),
                          dict(nonce_hash="raw-nonce"), dict(nonce_hash="A" * 64),
                          dict(destination="gallery_cloud"), dict(destination="personal_cloud"),
                          dict(device_id="C:\\Vault"), dict(device_id=None), dict(publisher="https://acs.org")):
            with self.subTest(overrides=overrides), self.assertRaises(sqlite3.IntegrityError):
                self.session(**overrides)
        existing = self.session()
        with self.assertRaises(sqlite3.IntegrityError):
            self.session(nonce_hash=existing["nonce_hash"])

    def test_capture_binding_is_immutable(self):
        session = self.session()
        self.document(user_id="user_b")
        for column, value in (("user_id", "user_b"), ("id", "other_session"), ("doi", OTHER_DOI),
                              ("publisher", "wiley"), ("destination", "opfs"), ("device_id", "device_b"),
                              ("nonce_hash", HASH_A), ("max_bytes", 9999),
                              ("created_at", NOW - 1), ("expires_at", NOW + 900_000)):
            with self.subTest(column=column), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(f"UPDATE pdf_capture_sessions SET {column}=? WHERE id=?", (value, session["id"]))

    def test_atomic_claim_checks_every_binding_and_size(self):
        session = self.session()
        for overrides in (dict(user_id="user_b"), dict(id="wrong_session"), dict(doi=OTHER_DOI),
                          dict(publisher="wiley"), dict(destination="opfs"), dict(device_id="device_b"),
                          dict(nonce_hash=HASH_B), dict(byte_length=0), dict(byte_length=-1),
                          dict(byte_length=4097), dict(byte_length=1.5), dict(now=NOW - 1),
                          dict(now=NOW + 1.5), dict(now=NOW + 600_000)):
            with self.subTest(overrides=overrides):
                self.assertEqual(self.consume(session, **overrides), 0)
        self.assertEqual(self.consume(session, byte_length=4096), 1)
        self.assertEqual(self.consume(session), 0)

    def test_expired_future_used_and_revoked_sessions_cannot_be_consumed(self):
        expired = self.session(created_at=NOW - 600_000, expires_at=NOW)
        future = self.session(created_at=NOW + 100, expires_at=NOW + 600_100)
        used = self.session(used_at=NOW)
        revoked = self.session(revoked_at=NOW)
        for session in (expired, future, used, revoked):
            with self.subTest(session=session["id"]):
                self.assertEqual(self.consume(session), 0)

    def test_used_and_revoked_cannot_be_reopened_or_coexist(self):
        used = self.session()
        self.assertEqual(self.consume(used), 1)
        revoked = self.session(revoked_at=NOW)
        for session, column, value in ((used, "used_at", None), (used, "used_at", NOW + 2),
                                        (used, "revoked_at", NOW + 2),
                                        (revoked, "revoked_at", None), (revoked, "used_at", NOW + 1)):
            with self.subTest(column=column, value=value), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(f"UPDATE pdf_capture_sessions SET {column}=? WHERE id=?", (value, session["id"]))

    def test_document_and_user_deletion_cascade_only_their_own_records(self):
        self.copy()
        self.session()
        self.document(user_id="user_b")
        self.copy(user_id="user_b")
        self.session(user_id="user_b")
        self.db.execute("DELETE FROM user_documents WHERE user_id='user_a' AND doi=?", (DOI,))
        for table in VAULT_TABLES:
            self.assertEqual(self.db.execute(f"SELECT DISTINCT user_id FROM {table}").fetchall(), [("user_b",)])
        self.db.execute("DELETE FROM users WHERE id='user_b'")
        for table in VAULT_TABLES:
            self.assertEqual(self.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone(), (0,))
        self.assertEqual(self.db.execute("SELECT id FROM users WHERE id='user_a'").fetchone(), ("user_a",))

    def test_concurrent_connections_have_only_one_atomic_claim_winner(self):
        session = self.session()
        self.db.commit()
        with tempfile.TemporaryDirectory(prefix="gallery-pdf-vault-") as directory:
            path = str(Path(directory) / "vault.sqlite")
            target = sqlite3.connect(path)
            self.db.backup(target)
            target.close()
            barrier = threading.Barrier(2)
            params = (NOW + 1, "user_a", session["id"], DOI, "acs", "local_folder",
                      "device_a", session["nonce_hash"], 1024)

            def claim():
                connection = sqlite3.connect(path, timeout=3)
                try:
                    connection.execute("PRAGMA foreign_keys=ON")
                    barrier.wait(timeout=3)
                    result = connection.execute(CONSUME, params).rowcount
                    connection.commit()
                    return result
                finally:
                    connection.close()

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda _: claim(), range(2)))
            self.assertEqual(sorted(results), [0, 1])


if __name__ == "__main__":
    unittest.main()
