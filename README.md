# Drag'n Drop Sorter

## Pourquoi cette librairie ?

Parce que je voulais un système permettant de réorganiser des éléments en grille :

- qui supporte le mobile ;
- qui ne rame pas (60fps) ;
- qui soit animé.

> Je suis comme saint Thomas, je ne crois que ce que je vois.
>
> -- <cite>Thomas</cite>

[Démonstration](http://grafikart.github.io/ReorderJS/index.html)

## Comment ça marche ?

Le code html doit être comme suit :

```html
<div data-sortable=".item" id="sort1">
    <div class="item" data-position="0" data-id="2">...</div>
    <div class="item" data-position="1" data-id="1">...</div>
    <div class="item" data-position="2" data-id="3">...</div>
</div>
```

Puis on intialise le Sorter de la manière suivante :

```js
sortable = new Sortable(document.querySelector('#sort1'));
sortable.success = function(results){
    console.log(results);
}
```
