import django.core.validators
from django.db import migrations, models


def ranking_com_cinco(apps, schema_editor):
    """Passa a configuração já criada para mostrar só o top 5."""
    ConfiguracaoJogo = apps.get_model("jogo", "ConfiguracaoJogo")
    ConfiguracaoJogo.objects.update(tamanho_ranking=5)


class Migration(migrations.Migration):

    dependencies = [
        ("jogo", "0007_ajustes_velocidade_e_icones"),
    ]

    operations = [
        migrations.AlterField(
            model_name="configuracaojogo",
            name="tamanho_ranking",
            field=models.PositiveSmallIntegerField(
                default=5,
                validators=[
                    django.core.validators.MinValueValidator(3),
                    django.core.validators.MaxValueValidator(50),
                ],
                verbose_name="posições no ranking",
            ),
        ),
        migrations.RunPython(ranking_com_cinco, migrations.RunPython.noop),
    ]
