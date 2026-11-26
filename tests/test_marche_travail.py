import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import marche_travail as mt


def rep(corps, status=200):
    return Mock(status_code=status, headers={}, text=json.dumps(corps), json=Mock(return_value=corps))


def get_factice(url, params=None, timeout=None):
    chemin = url.split("/v1", 1)[1]
    if chemin == "/referentiel/type-territoires":
        return rep([{"codeTypeTerritoire": "DEP", "libelleTypeTerritoire": "Département"},
                    {"codeTypeTerritoire": "REG", "libelleTypeTerritoire": "Région"},
                    {"codeTypeTerritoire": "ZE", "libelleTypeTerritoire": "Zone d'emploi"}])
    if chemin == "/referentiel/details-indicateurs":
        if params["codeIndicateur"] == "PERSP_2":
            return rep({"message": "erreur"}, 500)
        return rep({"codeIndicateur": params["codeIndicateur"], "descriptif": "texte long non conservé",
                    "listeTypesTerritoiresIndicateur": [{"codeTypeTerritoire": "DEP"}]})
    if chemin.startswith("/referentiel/territoires/"):
        if params["filtreTerritoire"] == "CAEN":
            return rep({"listeTerritoire": [{"codeTerritoire": "2802", "libelleTerritoire": "CAEN", "codeTypeTerritoire": "ZE"}]})
        return rep(None, 204)
    raise AssertionError(chemin)


class MarcheTravailTests(unittest.TestCase):
    def setUp(self):
        self.jeton = patch.object(mt, "_jeton", return_value="jeton-test").start()
        self.session = patch.object(mt.requests, "Session").start().return_value
        self.session.get.side_effect = get_factice
        patch.object(mt.time, "sleep").start()
        patch.dict(os.environ, {"FT_CLIENT_ID": "id", "FT_CLIENT_SECRET": "secret"}).start()
        self.addCleanup(patch.stopall)
        self.dossier = Path(tempfile.mkdtemp())

    def test_scope_documente(self):
        mt.Client("id", "secret")
        self.jeton.assert_called_once_with("id", "secret", "api_stats-offres-demandes-emploiv1 offresetdemandesemploi", "Marché du travail v1")

    def test_decouverte_ecrit_le_referentiel_et_garde_les_erreurs(self):
        resume = mt.collecter_marche_travail("200065563", self.dossier, journal=lambda m: None)
        data = json.loads((self.dossier / "marche_travail_referentiel.json").read_text(encoding="utf-8"))
        self.assertEqual(resume["erreurs"], 1)
        self.assertIn("PERSP_2", data["erreurs"][0])
        self.assertEqual(data["territoires"]["ZE"], [{"codeTerritoire": "2802", "libelleTerritoire": "CAEN", "codeTypeTerritoire": "ZE"}])
        self.assertNotIn("REG", data["territoires"])
        self.assertNotIn("descriptif", data["indicateurs"]["OFF_1"][0])
        self.assertEqual(data["indicateurs"]["OFF_1"][0]["listeTypesTerritoiresIndicateur"], [{"codeTypeTerritoire": "DEP"}])

    def test_sans_identifiants_aucun_appel(self):
        with patch.dict(os.environ, {"FT_CLIENT_SECRET": ""}):
            self.assertIsNone(mt.collecter_marche_travail("200065563", self.dossier, journal=lambda m: None))
        self.session.get.assert_not_called()

    def test_refus_du_jeton_remonte(self):
        self.jeton.side_effect = RuntimeError("identification France Travail refusée (invalid_scope)")
        with self.assertRaisesRegex(RuntimeError, "invalid_scope"):
            mt.collecter_marche_travail("200065563", self.dossier, journal=lambda m: None)
        self.assertFalse((self.dossier / "marche_travail_referentiel.json").exists())


if __name__ == "__main__":
    unittest.main()
