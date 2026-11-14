from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd

import collecte


def etab(siret, tranche="NN", nom="X"):
    return {"siret": siret, "nom": nom, "commune": "Cabourg", "code_commune": "14117", "naf_libelle": "Restauration",
            "section": "I", "tranche_effectif": tranche, "tranche_libelle": collecte.TRANCHES[tranche][0],
            "type_structure": "Société commerciale"}


class JournalTests(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.addCleanup(self.dossier.cleanup)
        patch.object(collecte, "DATA", Path(self.dossier.name)).start()
        patch.object(collecte, "log").start()
        self.addCleanup(patch.stopall)

    def lire(self):
        return pd.read_csv(Path(self.dossier.name) / "journal.csv", dtype=str, keep_default_na=False)

    def test_entrees_sorties_et_effectif(self):
        ancien = pd.DataFrame([etab("1", "01"), etab("2", "NN"), etab("3", "03")])
        nouveau = pd.DataFrame([etab("1", "03"), etab("3", "03"), etab("4", "NN")])
        collecte.mettre_a_jour_journal(ancien, nouveau, "2026-11-14")
        j = self.lire().set_index("siret")
        self.assertEqual(list(self.lire().columns), collecte.COLONNES_JOURNAL)
        self.assertEqual(j.loc["4", "evenement"], "Nouvel établissement")
        self.assertEqual(j.loc["2", "evenement"], "Établissement sorti")
        self.assertEqual(j.loc["1", "evenement"], "Changement d'effectif")
        self.assertEqual(j.loc["1", "detail"], "1 ou 2 salariés → 6 à 9 salariés")
        self.assertNotIn("3", j.index)            # tranche inchangée

    def test_tranche_absente_vaut_non_renseigne(self):
        ancien = pd.DataFrame([etab("1", "NN")]).assign(tranche_effectif="")
        nouveau = pd.DataFrame([etab("1", "NN")]).assign(tranche_effectif="nan")
        collecte.mettre_a_jour_journal(ancien, nouveau, "2026-11-14")
        self.assertTrue(self.lire().empty)

    def test_ancien_journal_sans_colonne_detail(self):
        (Path(self.dossier.name) / "journal.csv").write_text(
            "date,evenement,siret,nom,commune,code_commune,naf_libelle,section,tranche_libelle,type_structure\n"
            "2026-11-11,Nouvel établissement,9,Y,Cabourg,14117,Restauration,I,Non renseigné,Société commerciale\n",
            encoding="utf-8")
        ancien = pd.DataFrame([etab("1", "00")])
        nouveau = pd.DataFrame([etab("1", "11")])
        collecte.mettre_a_jour_journal(ancien, nouveau, "2026-11-14")
        j = self.lire()
        self.assertEqual(list(j.columns), collecte.COLONNES_JOURNAL)
        self.assertEqual(len(j), 2)
        self.assertEqual(j.loc[j["siret"] == "9", "detail"].item(), "")


if __name__ == "__main__":
    unittest.main()
